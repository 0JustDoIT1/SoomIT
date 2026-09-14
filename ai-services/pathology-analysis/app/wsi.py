from __future__ import annotations

import random
from pathlib import Path

import numpy as np
import openslide
import timm
import torch
from PIL import Image
from timm.data import create_transform, resolve_data_config


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
            if not coordinates:
                raise ValueError("no tissue patches were found in the WSI")
            batches: list[torch.Tensor] = []
            use_amp = self.device.type == "cuda"
            for start in range(0, len(coordinates), self.batch_size):
                images = [
                    self.transform(
                        slide.read_region((x, y), patch_level, (tile_size, tile_size)).convert("RGB")
                    )
                    for x, y, patch_level in coordinates[start : start + self.batch_size]
                ]
                batch = torch.stack(images).to(self.device)
                with torch.inference_mode(), torch.autocast(
                    device_type=self.device.type,
                    dtype=torch.float16,
                    enabled=use_amp,
                ):
                    embedding = self.model(batch)
                batches.append(embedding.float().cpu())
            return torch.cat(batches, dim=0), coordinates, level
        finally:
            slide.close()
