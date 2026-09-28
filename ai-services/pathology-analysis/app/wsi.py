from __future__ import annotations

import logging
import random
import time
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path

import cv2
import numpy as np
import openslide
import timm
import torch
from PIL import Image
from timm.data import create_transform, resolve_data_config


logger = logging.getLogger("uvicorn.error")


def log_latency(stage: str, started: float) -> None:
    logger.info(
        "latency service=pathology_analysis stage=%s elapsed_seconds=%.3f",
        stage,
        time.perf_counter() - started,
    )


def otsu_threshold(gray: np.ndarray) -> int:
    histogram = np.bincount(gray.reshape(-1), minlength=256).astype(np.float64)
    probability = histogram / max(histogram.sum(), 1.0)
    omega = np.cumsum(probability)
    mean = np.cumsum(probability * np.arange(256))
    total_mean = mean[-1]
    denominator = omega * (1.0 - omega)
    variance = np.zeros_like(denominator)
    valid = denominator > 0
    variance[valid] = (
        (total_mean * omega[valid] - mean[valid]) ** 2 / denominator[valid]
    )
    return int(np.argmax(variance))


def tissue_mask(slide: openslide.OpenSlide, thumbnail_size: int) -> tuple[np.ndarray, tuple[int, int]]:
    thumbnail = slide.get_thumbnail((thumbnail_size, thumbnail_size)).convert("RGB")
    rgb = np.asarray(thumbnail, dtype=np.uint8)
    gray = np.asarray(Image.fromarray(rgb).convert("L"), dtype=np.uint8)
    threshold = otsu_threshold(gray)
    return gray < threshold, thumbnail.size


def heatmap_tissue_mask(
    slide: openslide.OpenSlide,
    thumbnail_size: int,
    *,
    min_area_ratio: float = 0.001,
) -> tuple[np.ndarray, tuple[int, int]]:
    """Build the HSV tissue mask used only by the visualization pass."""
    thumbnail = slide.get_thumbnail((thumbnail_size, thumbnail_size)).convert("RGB")
    rgb = np.asarray(thumbnail, dtype=np.uint8)
    saturation = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)[..., 1]
    saturation = cv2.medianBlur(saturation, 7)
    _, mask = cv2.threshold(
        saturation,
        0,
        255,
        cv2.THRESH_BINARY + cv2.THRESH_OTSU,
    )
    mask = cv2.morphologyEx(
        mask,
        cv2.MORPH_CLOSE,
        np.ones((5, 5), dtype=np.uint8),
    )

    component_count, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    keep = np.zeros(component_count, dtype=bool)
    keep[1:] = stats[1:, cv2.CC_STAT_AREA] >= mask.size * min_area_ratio
    return np.where(keep[labels], 1.0, 0.0).astype(np.float32), thumbnail.size


def create_preview(slide_path: Path, max_size: int = 1200) -> bytes:
    """Render a bounded JPEG preview without exposing the original SVS."""
    slide = openslide.OpenSlide(str(slide_path))
    try:
        thumbnail = slide.get_thumbnail((max_size, max_size)).convert("RGB")
        output = BytesIO()
        thumbnail.save(output, format="JPEG", quality=85, optimize=True)
        return output.getvalue()
    finally:
        slide.close()


def create_tissue_attention_heatmap(
    slide_path: Path,
    coordinates: list[tuple[int, int, int]],
    attention: list[float],
    *,
    tile_size: int,
    max_size: int = 1200,
) -> bytes:
    """Render the overlap-patch CLAM heatmap while preserving the JPEG contract."""
    if len(coordinates) != len(attention) or not coordinates:
        raise ValueError("attention and patch coordinates must have equal nonzero lengths")

    slide = openslide.OpenSlide(str(slide_path))
    try:
        preview = slide.get_thumbnail((max_size, max_size)).convert("RGB")
        preview_width, preview_height = preview.size
        scores = np.asarray(attention, dtype=np.float32)
        if not np.all(np.isfinite(scores)):
            raise ValueError("attention scores are not finite")

        level = coordinates[0][2]
        if any(coordinate[2] != level for coordinate in coordinates):
            raise ValueError("heatmap coordinates must use one slide level")
        downsample = float(slide.level_downsamples[level])
        level_width, level_height = slide.level_dimensions[level]
        scale_x = preview_width / level_width
        scale_y = preview_height / level_height
        patch_width = max(1, int(round(tile_size * scale_x)))
        patch_height = max(1, int(round(tile_size * scale_y)))

        score_sum = np.zeros((preview_height, preview_width), dtype=np.float64)
        score_count = np.zeros((preview_height, preview_width), dtype=np.float64)
        for (base_x, base_y, _), score in zip(coordinates, scores, strict=True):
            level_x = base_x / downsample
            level_y = base_y / downsample
            x1 = max(0, min(preview_width, int(level_x * scale_x)))
            y1 = max(0, min(preview_height, int(level_y * scale_y)))
            x2 = min(preview_width, x1 + patch_width)
            y2 = min(preview_height, y1 + patch_height)
            if x2 > x1 and y2 > y1:
                score_sum[y1:y2, x1:x2] += float(score)
                score_count[y1:y2, x1:x2] += 1.0

        no_data = score_count <= 0
        if np.all(no_data):
            raise ValueError("attention patches do not overlap the WSI preview")

        sigma_x = max(1.0, patch_width * 0.5)
        sigma_y = max(1.0, patch_height * 0.5)
        score_sum = cv2.GaussianBlur(
            score_sum,
            (0, 0),
            sigmaX=sigma_x,
            sigmaY=sigma_y,
            borderType=cv2.BORDER_REFLECT,
        )
        score_count = cv2.GaussianBlur(
            score_count,
            (0, 0),
            sigmaX=sigma_x,
            sigmaY=sigma_y,
            borderType=cv2.BORDER_REFLECT,
        )
        with np.errstate(invalid="ignore", divide="ignore"):
            blended = np.where(score_count > 1e-9, score_sum / score_count, np.nan)
        blended[no_data] = np.nan

        visible_scores = blended[~np.isnan(blended)]
        display_low, display_high = np.percentile(visible_scores, (1, 99))
        if display_high <= display_low:
            relative_attention = np.zeros_like(blended)
        else:
            relative_attention = np.clip(
                (blended - display_low) / (display_high - display_low),
                0.0,
                1.0,
            ).astype(np.float32)
        heat_u8 = (
            np.nan_to_num(relative_attention, nan=0.0) * 255
        ).clip(0, 255).astype(np.uint8)
        colors = cv2.cvtColor(
            cv2.applyColorMap(heat_u8, cv2.COLORMAP_TURBO),
            cv2.COLOR_BGR2RGB,
        )
        alpha = np.where(no_data, 0.0, 0.5).astype(np.float32)[..., None]
        preview_rgb = np.asarray(preview, dtype=np.float32)
        composed = (
            preview_rgb * (1.0 - alpha) + colors.astype(np.float32) * alpha
        ).clip(0, 255).astype(np.uint8)
        output = BytesIO()
        Image.fromarray(composed).save(
            output,
            format="JPEG",
            quality=88,
            optimize=True,
        )
        return output.getvalue()
    finally:
        slide.close()


def select_level(slide: openslide.OpenSlide, target_mpp: float) -> tuple[int, float]:
    raw_mpp = slide.properties.get(openslide.PROPERTY_NAME_MPP_X)
    if raw_mpp is None:
        return 0, 1.0
    base_mpp = float(raw_mpp)
    level = min(
        range(slide.level_count),
        key=lambda index: abs(base_mpp * slide.level_downsamples[index] - target_mpp),
    )
    return level, float(slide.level_downsamples[level])


def patch_coordinates(
    slide: openslide.OpenSlide,
    mask: np.ndarray,
    thumbnail_size: tuple[int, int],
    *,
    tile_size: int,
    tissue_fraction: float,
    target_mpp: float,
    max_patches: int,
    seed: int,
    overlap_ratio: float = 0.0,
) -> tuple[list[tuple[int, int, int]], int]:
    if not 0.0 <= overlap_ratio < 1.0:
        raise ValueError("overlap_ratio must be at least 0 and less than 1")
    level, downsample = select_level(slide, target_mpp)
    level_width, level_height = slide.level_dimensions[level]
    base_width, base_height = slide.dimensions
    thumb_width, thumb_height = thumbnail_size
    scale_x, scale_y = base_width / thumb_width, base_height / thumb_height
    stride = max(1, int(round(tile_size * (1.0 - overlap_ratio))))
    coordinates: list[tuple[int, int, int]] = []
    for y in range(0, level_height, stride):
        for x in range(0, level_width, stride):
            if x + tile_size > level_width or y + tile_size > level_height:
                continue
            base_x, base_y = int(x * downsample), int(y * downsample)
            width, height = int(tile_size * downsample), int(tile_size * downsample)
            x1, y1 = int(base_x / scale_x), int(base_y / scale_y)
            x2, y2 = int((base_x + width) / scale_x), int((base_y + height) / scale_y)
            x1, y1 = max(0, min(x1, thumb_width - 1)), max(0, min(y1, thumb_height - 1))
            x2, y2 = max(x1 + 1, min(x2, thumb_width)), max(y1 + 1, min(y2, thumb_height))
            region = mask[y1:y2, x1:x2]
            if region.size and float(region.mean()) >= tissue_fraction:
                coordinates.append((base_x, base_y, level))
    if len(coordinates) > max_patches:
        coordinates = random.Random(seed).sample(coordinates, max_patches)
    return coordinates, level


def heatmap_patch_coordinates(
    slide: openslide.OpenSlide,
    mask: np.ndarray,
    thumbnail_size: tuple[int, int],
    *,
    tile_size: int,
    tissue_fraction: float,
    target_mpp: float,
    max_patches: int,
    overlap_ratio: float,
) -> tuple[list[tuple[int, int, int]], int]:
    """Select overlapping heatmap patches and cap them uniformly in slide order."""
    if not 0.0 <= overlap_ratio < 1.0:
        raise ValueError("overlap_ratio must be at least 0 and less than 1")
    level, downsample = select_level(slide, target_mpp)
    level_width, level_height = slide.level_dimensions[level]
    base_width, base_height = slide.dimensions
    thumb_width, thumb_height = thumbnail_size
    scale_x, scale_y = base_width / thumb_width, base_height / thumb_height
    stride = max(1, int(tile_size * (1.0 - overlap_ratio)))
    base_tile_size = int(tile_size * downsample)
    integral = cv2.integral((mask > 0).astype(np.uint8))

    coordinates: list[tuple[int, int, int]] = []
    for level_y in range(0, max(1, level_height - tile_size + 1), stride):
        for level_x in range(0, max(1, level_width - tile_size + 1), stride):
            base_x = int(level_x * downsample)
            base_y = int(level_y * downsample)
            x1, y1 = int(base_x / scale_x), int(base_y / scale_y)
            x2 = int((base_x + base_tile_size) / scale_x)
            y2 = int((base_y + base_tile_size) / scale_y)
            x1, y1 = max(0, min(x1, thumb_width - 1)), max(0, min(y1, thumb_height - 1))
            x2, y2 = max(x1 + 1, min(x2, thumb_width)), max(y1 + 1, min(y2, thumb_height))
            area = (x2 - x1) * (y2 - y1)
            tissue_area = (
                integral[y2, x2]
                - integral[y1, x2]
                - integral[y2, x1]
                + integral[y1, x1]
            )
            if area > 0 and tissue_area / area >= tissue_fraction:
                coordinates.append((base_x, base_y, level))

    if len(coordinates) > max_patches:
        indices = np.linspace(0, len(coordinates) - 1, max_patches).round().astype(int)
        coordinates = [coordinates[index] for index in indices]
    return coordinates, level


class Uni2hEmbedder:
    def __init__(self, device: torch.device, batch_size: int) -> None:
        self.device = device
        self.batch_size = batch_size
        self.model = timm.create_model(
            "hf-hub:MahmoodLab/UNI2-h",
            pretrained=True,
            img_size=224,
            patch_size=14,
            depth=24,
            num_heads=24,
            init_values=1e-5,
            embed_dim=1536,
            mlp_ratio=2.66667 * 2,
            num_classes=0,
            no_embed_class=True,
            mlp_layer=timm.layers.SwiGLUPacked,
            act_layer=torch.nn.SiLU,
            reg_tokens=8,
            dynamic_img_size=True,
        ).eval().to(device)
        config = resolve_data_config(self.model.pretrained_cfg, model=self.model)
        self.transform = create_transform(**config)

    def embed(
        self,
        slide_path: Path,
        *,
        max_patches: int,
        tile_size: int,
        target_mpp: float,
        tissue_fraction: float,
        thumbnail_size: int,
        seed: int,
        overlap_ratio: float = 0.0,
        heatmap_mode: bool = False,
    ) -> tuple[torch.Tensor, list[tuple[int, int, int]], int]:
        stage_started = time.perf_counter()
        slide = openslide.OpenSlide(str(slide_path))
        try:
            if heatmap_mode:
                mask, thumb_size = heatmap_tissue_mask(slide, thumbnail_size)
                coordinates, level = heatmap_patch_coordinates(
                    slide,
                    mask,
                    thumb_size,
                    tile_size=tile_size,
                    tissue_fraction=tissue_fraction,
                    target_mpp=target_mpp,
                    max_patches=max_patches,
                    overlap_ratio=overlap_ratio,
                )
            else:
                mask, thumb_size = tissue_mask(slide, thumbnail_size)
                coordinates, level = patch_coordinates(
                    slide,
                    mask,
                    thumb_size,
                    tile_size=tile_size,
                    tissue_fraction=tissue_fraction,
                    target_mpp=target_mpp,
                    max_patches=max_patches,
                    seed=seed,
                    overlap_ratio=overlap_ratio,
                )
            log_latency("wsi_open_and_patch_selection", stage_started)
            if not coordinates:
                raise ValueError("no tissue patches were found in the WSI")
            batches: list[torch.Tensor] = []
            use_amp = self.device.type == "cuda"
            read_and_transform_seconds = 0.0
            prefetch_wait_seconds = 0.0
            host_to_device_seconds = 0.0
            gpu_embed_seconds = 0.0

            def read_batch(batch_coordinates: list[tuple[int, int, int]]) -> torch.Tensor:
                nonlocal read_and_transform_seconds
                read_started = time.perf_counter()
                images = [
                    self.transform(
                        slide.read_region((x, y), patch_level, (tile_size, tile_size)).convert("RGB")
                    )
                    for x, y, patch_level in batch_coordinates
                ]
                batch = torch.stack(images)
                read_and_transform_seconds += time.perf_counter() - read_started
                return batch

            batch_slices = [
                coordinates[start : start + self.batch_size]
                for start in range(0, len(coordinates), self.batch_size)
            ]
            # Only one thread ever calls into openslide at a time (this pool has a
            # single worker), so it never reads concurrently with itself - it only
            # overlaps with the *next* batch's CPU tile read/transform running while
            # the *current* batch's GPU forward pass is in flight, since neither
            # touches the slide handle. Read order, batch order, and the model call
            # itself are unchanged, so results are identical to the sequential loop.
            with ThreadPoolExecutor(max_workers=1) as prefetch_executor:
                next_batch_future = prefetch_executor.submit(read_batch, batch_slices[0])
                for index, _ in enumerate(batch_slices):
                    wait_started = time.perf_counter()
                    batch_cpu = next_batch_future.result()
                    prefetch_wait_seconds += time.perf_counter() - wait_started
                    if index + 1 < len(batch_slices):
                        next_batch_future = prefetch_executor.submit(read_batch, batch_slices[index + 1])
                    transfer_started = time.perf_counter()
                    batch = batch_cpu.to(self.device)
                    host_to_device_seconds += time.perf_counter() - transfer_started
                    gpu_started = time.perf_counter()
                    with torch.inference_mode(), torch.autocast(
                        device_type=self.device.type,
                        dtype=torch.float16,
                        enabled=use_amp,
                    ):
                        embedding = self.model(batch)
                    batches.append(embedding.float().cpu())
                    gpu_embed_seconds += time.perf_counter() - gpu_started
            logger.info(
                "latency service=pathology_analysis stage=patch_read_and_transform elapsed_seconds=%.3f",
                read_and_transform_seconds,
            )
            logger.info(
                "latency service=pathology_analysis stage=patch_prefetch_wait elapsed_seconds=%.3f",
                prefetch_wait_seconds,
            )
            logger.info(
                "latency service=pathology_analysis stage=embedding_host_to_device elapsed_seconds=%.3f",
                host_to_device_seconds,
            )
            logger.info(
                "latency service=pathology_analysis stage=embedding_gpu_inference elapsed_seconds=%.3f",
                gpu_embed_seconds,
            )
            logger.info(
                "latency service=pathology_analysis stage=patch_count value=%d batch_size=%d device=%s",
                len(coordinates),
                self.batch_size,
                self.device,
            )
            return torch.cat(batches, dim=0), coordinates, level
        finally:
            slide.close()
