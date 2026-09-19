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
from PIL import Image, ImageDraw, ImageFilter
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
    """Render tissue CLAM attention over a bounded H&E thumbnail."""
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

        intensity = Image.new("L", preview.size, 0)
        draw = ImageDraw.Draw(intensity)
        for (base_x, base_y, level), score in zip(coordinates, normalized, strict=True):
            downsample = float(slide.level_downsamples[level])
            patch_width = tile_size * downsample * scale_x
            patch_height = tile_size * downsample * scale_y
            x1 = max(0, min(preview_width, int(base_x * scale_x)))
            y1 = max(0, min(preview_height, int(base_y * scale_y)))
            x2 = max(x1, min(preview_width, int(np.ceil(base_x * scale_x + patch_width))))
            y2 = max(y1, min(preview_height, int(np.ceil(base_y * scale_y + patch_height))))
            strength = int(float(score) * 255)
            if x2 > x1 and y2 > y1:
                draw.rectangle((x1, y1, x2 - 1, y2 - 1), fill=strength)

        blur_radius = max(1.0, min(preview.size) / 700)
        intensity = intensity.filter(ImageFilter.GaussianBlur(radius=blur_radius))
        # Suppress low attention and make high attention visible while retaining
        # the underlying H&E morphology.
        intensity = intensity.point(lambda value: 0 if value < 48 else min(170, int(((value - 48) / 207) ** 1.35 * 170)))
        red_overlay = Image.new("RGBA", preview.size, (230, 35, 70, 0))
        red_overlay.putalpha(intensity)
        composed = Image.alpha_composite(preview.convert("RGBA"), red_overlay).convert("RGB")
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
) -> tuple[list[tuple[int, int, int]], int]:
    level, downsample = select_level(slide, target_mpp)
    level_width, level_height = slide.level_dimensions[level]
    base_width, base_height = slide.dimensions
    thumb_width, thumb_height = thumbnail_size
    scale_x, scale_y = base_width / thumb_width, base_height / thumb_height
    coordinates: list[tuple[int, int, int]] = []
    for y in range(0, level_height, tile_size):
        for x in range(0, level_width, tile_size):
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
            )
            log_latency("wsi_open_and_patch_selection", stage_started)
            if not coordinates:
                raise ValueError("no tissue patches were found in the WSI")
            batches: list[torch.Tensor] = []
            use_amp = self.device.type == "cuda"
            read_and_transform_seconds = 0.0
            gpu_embed_seconds = 0.0

            def read_batch(batch_coordinates: list[tuple[int, int, int]]) -> torch.Tensor:
                images = [
                    self.transform(
                        slide.read_region((x, y), patch_level, (tile_size, tile_size)).convert("RGB")
                    )
                    for x, y, patch_level in batch_coordinates
                ]
                return torch.stack(images)

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
                    read_and_transform_seconds += time.perf_counter() - wait_started
                    if index + 1 < len(batch_slices):
                        next_batch_future = prefetch_executor.submit(read_batch, batch_slices[index + 1])
                    batch = batch_cpu.to(self.device)
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
                "latency service=pathology_analysis stage=embedding_gpu_inference elapsed_seconds=%.3f",
                gpu_embed_seconds,
            )
            logger.info(
                "latency service=pathology_analysis stage=patch_count value=%d",
                len(coordinates),
            )
            return torch.cat(batches, dim=0), coordinates, level
        finally:
            slide.close()
