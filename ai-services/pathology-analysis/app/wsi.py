from __future__ import annotations

import logging
import random
import time
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path

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


def preview_tissue_mask(rgb: np.ndarray) -> np.ndarray:
    """Keep both dark and lightly stained H&E tissue while excluding white glass."""
    gray = np.asarray(Image.fromarray(rgb).convert("L"), dtype=np.uint8)
    chroma = rgb.max(axis=2).astype(np.int16) - rgb.min(axis=2).astype(np.int16)
    return (gray <= otsu_threshold(gray)) | ((chroma >= 10) & (gray < 245))


def attention_colormap(values: np.ndarray) -> np.ndarray:
    """Map relative attention to a perceptually ordered blue-to-red palette."""
    positions = np.asarray((0.0, 0.2, 0.4, 0.6, 0.8, 1.0), dtype=np.float32)
    anchors = np.asarray(
        (
            (48, 18, 59),
            (45, 92, 210),
            (30, 185, 175),
            (185, 225, 45),
            (250, 140, 15),
            (180, 4, 38),
        ),
        dtype=np.float32,
    )
    colors = np.empty((*values.shape, 3), dtype=np.uint8)
    for channel in range(3):
        colors[..., channel] = np.interp(values, positions, anchors[:, channel]).astype(
            np.uint8
        )
    return colors


def tissue_mask(slide: openslide.OpenSlide, thumbnail_size: int) -> tuple[np.ndarray, tuple[int, int]]:
    thumbnail = slide.get_thumbnail((thumbnail_size, thumbnail_size)).convert("RGB")
    rgb = np.asarray(thumbnail, dtype=np.uint8)
    gray = np.asarray(Image.fromarray(rgb).convert("L"), dtype=np.uint8)
    threshold = otsu_threshold(gray)
    return gray < threshold, thumbnail.size


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
    """Render blended tissue CLAM attention over a bounded H&E thumbnail."""
    if len(coordinates) != len(attention) or not coordinates:
        raise ValueError("attention and patch coordinates must have equal nonzero lengths")

    slide = openslide.OpenSlide(str(slide_path))
    try:
        preview = slide.get_thumbnail((max_size, max_size)).convert("RGB")
        preview_width, preview_height = preview.size
        base_width, base_height = slide.dimensions
        scale_x = preview_width / base_width
        scale_y = preview_height / base_height

        scores = np.asarray(attention, dtype=np.float32)
        low, high = np.percentile(scores, (5, 99))
        if not np.isfinite(low) or not np.isfinite(high):
            raise ValueError("attention scores are not finite")
        if high <= low:
            normalized = np.zeros_like(scores)
        else:
            normalized = np.clip((scores - low) / (high - low), 0.0, 1.0)

        score_sum = np.zeros((preview_height, preview_width), dtype=np.float32)
        score_weight = np.zeros((preview_height, preview_width), dtype=np.float32)
        coverage = np.zeros((preview_height, preview_width), dtype=bool)
        for (base_x, base_y, level), score in zip(coordinates, normalized, strict=True):
            downsample = float(slide.level_downsamples[level])
            patch_width = tile_size * downsample * scale_x
            patch_height = tile_size * downsample * scale_y
            x1 = max(0, min(preview_width, int(base_x * scale_x)))
            y1 = max(0, min(preview_height, int(base_y * scale_y)))
            x2 = max(x1, min(preview_width, int(np.ceil(base_x * scale_x + patch_width))))
            y2 = max(y1, min(preview_height, int(np.ceil(base_y * scale_y + patch_height))))
            if x2 > x1 and y2 > y1:
                coverage[y1:y2, x1:x2] = True
                center_x = (x1 + x2) / 2.0
                center_y = (y1 + y2) / 2.0
                radius_x = max(1, int(np.ceil(patch_width * 1.5)))
                radius_y = max(1, int(np.ceil(patch_height * 1.5)))
                blend_x1 = max(0, int(np.floor(center_x - radius_x)))
                blend_y1 = max(0, int(np.floor(center_y - radius_y)))
                blend_x2 = min(preview_width, int(np.ceil(center_x + radius_x)))
                blend_y2 = min(preview_height, int(np.ceil(center_y + radius_y)))
                grid_x = np.arange(blend_x1, blend_x2, dtype=np.float32) + 0.5
                grid_y = np.arange(blend_y1, blend_y2, dtype=np.float32) + 0.5
                sigma_x = max(1.0, patch_width * 0.75)
                sigma_y = max(1.0, patch_height * 0.75)
                gaussian = np.exp(
                    -0.5
                    * (
                        ((grid_y[:, None] - center_y) / sigma_y) ** 2
                        + ((grid_x[None, :] - center_x) / sigma_x) ** 2
                    )
                )
                score_sum[blend_y1:blend_y2, blend_x1:blend_x2] += float(score) * gaussian
                score_weight[blend_y1:blend_y2, blend_x1:blend_x2] += gaussian

        if not np.any(coverage):
            raise ValueError("attention patches do not overlap the WSI preview")

        # Gaussian splatting treats each patch attention as a measurement at its
        # center. Dividing by the accumulated weights removes visible tile edges.
        blended = np.divide(
            score_sum,
            score_weight,
            out=np.zeros_like(score_sum),
            where=score_weight > 0,
        )
        blended = np.clip(blended, 0.0, 1.0)

        preview_rgb = np.asarray(preview, dtype=np.uint8)
        visible_tissue = coverage & preview_tissue_mask(preview_rgb)
        if not np.any(visible_tissue):
            visible_tissue = coverage
        visible_scores = blended[visible_tissue]
        display_low, display_high = np.percentile(visible_scores, (1, 99))
        if display_high <= display_low:
            relative_attention = np.zeros_like(blended)
        else:
            relative_attention = np.clip(
                (blended - display_low) / (display_high - display_low),
                0.0,
                1.0,
            ).astype(np.float32)
        colors = attention_colormap(relative_attention)
        visibility = np.clip((relative_attention - 0.06) / 0.94, 0.0, 1.0)
        alpha = np.where(
            visible_tissue,
            225.0 * np.power(visibility, 0.7),
            0.0,
        ).astype(np.uint8)
        overlay = Image.fromarray(
            np.dstack((colors, alpha)),
            mode="RGBA",
        )
        composed = Image.alpha_composite(preview.convert("RGBA"), overlay).convert("RGB")
        output = BytesIO()
        composed.save(output, format="JPEG", quality=88, optimize=True)
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
    ) -> tuple[torch.Tensor, list[tuple[int, int, int]], int]:
        stage_started = time.perf_counter()
        slide = openslide.OpenSlide(str(slide_path))
        try:
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
