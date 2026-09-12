#!/usr/bin/env python3

"""
coordinate_transform.py

Coordinate utilities for CPMNetv2 deployment.

Coordinate conventions
----------------------
Internal numpy / detection:
    ZYX

SimpleITK index:
    XYZ

World / physical coordinate:
    XYZ mm

Detection output:
    center_zyx
    size_dhw

This module converts:
    resampled voxel ZYX
        ->
    world XYZ mm
        ->
    original voxel XYZ / ZYX

Also provides 3D bounding box conversion.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Sequence, Tuple

import numpy as np


# =============================================================================
# BASIC HELPERS
# =============================================================================

def _as_float_array(
    values: Sequence[float],
    expected_length: int,
    name: str,
) -> np.ndarray:

    array = np.asarray(
        values,
        dtype=np.float64,
    )

    if array.shape != (
        expected_length,
    ):

        raise ValueError(
            f"{name} shape 오류: "
            f"expected ({expected_length},), "
            f"got {array.shape}"
        )

    if not np.all(
        np.isfinite(
            array
        )
    ):

        raise ValueError(
            f"{name}에 NaN/Inf가 있습니다."
        )

    return array


def zyx_to_xyz(
    zyx: Sequence[float],
) -> np.ndarray:

    zyx = _as_float_array(
        zyx,
        3,
        "zyx",
    )

    return np.asarray(
        [
            zyx[2],
            zyx[1],
            zyx[0],
        ],
        dtype=np.float64,
    )


def xyz_to_zyx(
    xyz: Sequence[float],
) -> np.ndarray:

    xyz = _as_float_array(
        xyz,
        3,
        "xyz",
    )

    return np.asarray(
        [
            xyz[2],
            xyz[1],
            xyz[0],
        ],
        dtype=np.float64,
    )


# =============================================================================
# GEOMETRY
# =============================================================================

def geometry_to_arrays(
    geometry: Dict[str, Any],
) -> Tuple[
    np.ndarray,
    np.ndarray,
    np.ndarray,
]:

    spacing_xyz = _as_float_array(
        geometry[
            "spacing_xyz_mm"
        ],
        3,
        "spacing_xyz_mm",
    )

    origin_xyz = _as_float_array(
        geometry[
            "origin_xyz_mm"
        ],
        3,
        "origin_xyz_mm",
    )

    direction_flat = _as_float_array(
        geometry[
            "direction"
        ],
        9,
        "direction",
    )

    direction = (
        direction_flat.reshape(
            3,
            3,
        )
    )

    if np.any(
        spacing_xyz <= 0
    ):

        raise ValueError(
            "spacing은 0보다 커야 합니다."
        )

    determinant = float(
        np.linalg.det(
            direction
        )
    )

    if abs(
        determinant
    ) < 1e-8:

        raise ValueError(
            "direction matrix가 singular입니다."
        )

    return (
        spacing_xyz,
        origin_xyz,
        direction,
    )


# =============================================================================
# INDEX -> WORLD
# =============================================================================

def voxel_xyz_to_world_xyz(
    voxel_xyz: Sequence[float],
    geometry: Dict[str, Any],
) -> np.ndarray:

    voxel_xyz = _as_float_array(
        voxel_xyz,
        3,
        "voxel_xyz",
    )

    (
        spacing_xyz,
        origin_xyz,
        direction,
    ) = geometry_to_arrays(
        geometry
    )

    physical_offset = (
        direction
        @ (
            voxel_xyz
            * spacing_xyz
        )
    )

    world_xyz = (
        origin_xyz
        + physical_offset
    )

    return world_xyz


def voxel_zyx_to_world_xyz(
    voxel_zyx: Sequence[float],
    geometry: Dict[str, Any],
) -> np.ndarray:

    voxel_xyz = zyx_to_xyz(
        voxel_zyx
    )

    return voxel_xyz_to_world_xyz(
        voxel_xyz,
        geometry,
    )


# =============================================================================
# WORLD -> INDEX
# =============================================================================

def world_xyz_to_voxel_xyz(
    world_xyz: Sequence[float],
    geometry: Dict[str, Any],
) -> np.ndarray:

    world_xyz = _as_float_array(
        world_xyz,
        3,
        "world_xyz",
    )

    (
        spacing_xyz,
        origin_xyz,
        direction,
    ) = geometry_to_arrays(
        geometry
    )

    inverse_direction = (
        np.linalg.inv(
            direction
        )
    )

    voxel_xyz = (
        inverse_direction
        @ (
            world_xyz
            - origin_xyz
        )
    )

    voxel_xyz = (
        voxel_xyz
        / spacing_xyz
    )

    return voxel_xyz


def world_xyz_to_voxel_zyx(
    world_xyz: Sequence[float],
    geometry: Dict[str, Any],
) -> np.ndarray:

    voxel_xyz = (
        world_xyz_to_voxel_xyz(
            world_xyz,
            geometry,
        )
    )

    return xyz_to_zyx(
        voxel_xyz
    )


# =============================================================================
# SIZE
# =============================================================================

def size_dhw_voxel_to_mm(
    size_dhw: Sequence[float],
    geometry: Dict[str, Any],
) -> np.ndarray:

    size_dhw = _as_float_array(
        size_dhw,
        3,
        "size_dhw",
    )

    spacing_zyx = _as_float_array(
        geometry[
            "spacing_zyx_mm"
        ],
        3,
        "spacing_zyx_mm",
    )

    return (
        size_dhw
        * spacing_zyx
    )


# =============================================================================
# BBOX
# =============================================================================

def center_size_to_bbox_zyx(
    center_zyx: Sequence[float],
    size_dhw: Sequence[float],
) -> Dict[str, List[float]]:

    center = _as_float_array(
        center_zyx,
        3,
        "center_zyx",
    )

    size = _as_float_array(
        size_dhw,
        3,
        "size_dhw",
    )

    minimum = (
        center
        - size
        / 2.0
    )

    maximum = (
        center
        + size
        / 2.0
    )

    return {
        "min_zyx":
            minimum.tolist(),

        "max_zyx":
            maximum.tolist(),
    }


def bbox_8_corners_zyx(
    center_zyx: Sequence[float],
    size_dhw: Sequence[float],
) -> np.ndarray:

    bbox = center_size_to_bbox_zyx(
        center_zyx,
        size_dhw,
    )

    minimum = np.asarray(
        bbox[
            "min_zyx"
        ],
        dtype=np.float64,
    )

    maximum = np.asarray(
        bbox[
            "max_zyx"
        ],
        dtype=np.float64,
    )

    z0, y0, x0 = minimum
    z1, y1, x1 = maximum

    corners = np.asarray(
        [
            [z0, y0, x0],
            [z0, y0, x1],
            [z0, y1, x0],
            [z0, y1, x1],

            [z1, y0, x0],
            [z1, y0, x1],
            [z1, y1, x0],
            [z1, y1, x1],
        ],
        dtype=np.float64,
    )

    return corners


def bbox_world_from_resampled(
    center_zyx: Sequence[float],
    size_dhw: Sequence[float],
    resampled_geometry: Dict[str, Any],
) -> Dict[str, Any]:

    corners_zyx = (
        bbox_8_corners_zyx(
            center_zyx,
            size_dhw,
        )
    )

    corners_world = np.asarray(
        [
            voxel_zyx_to_world_xyz(
                corner,
                resampled_geometry,
            )

            for corner in corners_zyx
        ],
        dtype=np.float64,
    )

    world_min = (
        corners_world.min(
            axis=0
        )
    )

    world_max = (
        corners_world.max(
            axis=0
        )
    )

    world_center = (
        voxel_zyx_to_world_xyz(
            center_zyx,
            resampled_geometry,
        )
    )

    return {
        "center_xyz_mm":
            world_center.tolist(),

        "min_xyz_mm":
            world_min.tolist(),

        "max_xyz_mm":
            world_max.tolist(),

        "corners_xyz_mm":
            corners_world.tolist(),
    }


def bbox_original_voxel_from_world(
    world_bbox: Dict[str, Any],
    original_geometry: Dict[str, Any],
) -> Dict[str, Any]:

    world_corners = np.asarray(
        world_bbox[
            "corners_xyz_mm"
        ],
        dtype=np.float64,
    )

    original_corners_xyz = np.asarray(
        [
            world_xyz_to_voxel_xyz(
                corner,
                original_geometry,
            )

            for corner in world_corners
        ],
        dtype=np.float64,
    )

    original_corners_zyx = (
        original_corners_xyz[
            :,
            ::-1
        ]
    )

    min_xyz = (
        original_corners_xyz.min(
            axis=0
        )
    )

    max_xyz = (
        original_corners_xyz.max(
            axis=0
        )
    )

    min_zyx = (
        original_corners_zyx.min(
            axis=0
        )
    )

    max_zyx = (
        original_corners_zyx.max(
            axis=0
        )
    )

    center_world = np.asarray(
        world_bbox[
            "center_xyz_mm"
        ],
        dtype=np.float64,
    )

    center_xyz = (
        world_xyz_to_voxel_xyz(
            center_world,
            original_geometry,
        )
    )

    center_zyx = (
        center_xyz[
            ::-1
        ]
    )

    return {
        "center_xyz":
            center_xyz.tolist(),

        "center_zyx":
            center_zyx.tolist(),

        "min_xyz":
            min_xyz.tolist(),

        "max_xyz":
            max_xyz.tolist(),

        "min_zyx":
            min_zyx.tolist(),

        "max_zyx":
            max_zyx.tolist(),

        "corners_xyz":
            original_corners_xyz.tolist(),

        "corners_zyx":
            original_corners_zyx.tolist(),
    }


# =============================================================================
# COMPLETE DETECTION TRANSFORM
# =============================================================================

def transform_detection_coordinates(
    center_resampled_zyx: Sequence[float],
    size_resampled_dhw: Sequence[float],
    original_geometry: Dict[str, Any],
    resampled_geometry: Dict[str, Any],
) -> Dict[str, Any]:

    center_resampled_zyx = (
        _as_float_array(
            center_resampled_zyx,
            3,
            "center_resampled_zyx",
        )
    )

    size_resampled_dhw = (
        _as_float_array(
            size_resampled_dhw,
            3,
            "size_resampled_dhw",
        )
    )

    center_world_xyz = (
        voxel_zyx_to_world_xyz(
            center_resampled_zyx,
            resampled_geometry,
        )
    )

    center_original_xyz = (
        world_xyz_to_voxel_xyz(
            center_world_xyz,
            original_geometry,
        )
    )

    center_original_zyx = (
        center_original_xyz[
            ::-1
        ]
    )

    size_mm_dhw = (
        size_dhw_voxel_to_mm(
            size_resampled_dhw,
            resampled_geometry,
        )
    )

    bbox_resampled = (
        center_size_to_bbox_zyx(
            center_resampled_zyx,
            size_resampled_dhw,
        )
    )

    bbox_world = (
        bbox_world_from_resampled(
            center_resampled_zyx,
            size_resampled_dhw,
            resampled_geometry,
        )
    )

    bbox_original = (
        bbox_original_voxel_from_world(
            bbox_world,
            original_geometry,
        )
    )

    return {
        "resampled_voxel": {
            "center_zyx":
                center_resampled_zyx.tolist(),

            "size_dhw":
                size_resampled_dhw.tolist(),

            "bbox_min_zyx":
                bbox_resampled[
                    "min_zyx"
                ],

            "bbox_max_zyx":
                bbox_resampled[
                    "max_zyx"
                ],
        },

        "physical_world": {
            "center_xyz_mm":
                center_world_xyz.tolist(),

            "size_dhw_mm":
                size_mm_dhw.tolist(),

            "bbox_min_xyz_mm":
                bbox_world[
                    "min_xyz_mm"
                ],

            "bbox_max_xyz_mm":
                bbox_world[
                    "max_xyz_mm"
                ],

            "bbox_corners_xyz_mm":
                bbox_world[
                    "corners_xyz_mm"
                ],
        },

        "original_voxel": {
            "center_xyz":
                center_original_xyz.tolist(),

            "center_zyx":
                center_original_zyx.tolist(),

            "bbox_min_xyz":
                bbox_original[
                    "min_xyz"
                ],

            "bbox_max_xyz":
                bbox_original[
                    "max_xyz"
                ],

            "bbox_min_zyx":
                bbox_original[
                    "min_zyx"
                ],

            "bbox_max_zyx":
                bbox_original[
                    "max_zyx"
                ],

            "bbox_corners_xyz":
                bbox_original[
                    "corners_xyz"
                ],

            "bbox_corners_zyx":
                bbox_original[
                    "corners_zyx"
                ],
        },
    }


# =============================================================================
# SELF TEST
# =============================================================================

if __name__ == "__main__":

    geometry = {
        "spacing_xyz_mm": [
            1.0,
            1.0,
            1.0,
        ],

        "spacing_zyx_mm": [
            1.0,
            1.0,
            1.0,
        ],

        "origin_xyz_mm": [
            0.0,
            0.0,
            0.0,
        ],

        "direction": [
            1.0,
            0.0,
            0.0,

            0.0,
            1.0,
            0.0,

            0.0,
            0.0,
            1.0,
        ],
    }

    result = (
        transform_detection_coordinates(
            center_resampled_zyx=[
                10.0,
                20.0,
                30.0,
            ],

            size_resampled_dhw=[
                4.0,
                6.0,
                8.0,
            ],

            original_geometry=geometry,

            resampled_geometry=geometry,
        )
    )

    assert np.allclose(
        result[
            "physical_world"
        ][
            "center_xyz_mm"
        ],
        [
            30.0,
            20.0,
            10.0,
        ],
    )

    assert np.allclose(
        result[
            "original_voxel"
        ][
            "center_zyx"
        ],
        [
            10.0,
            20.0,
            30.0,
        ],
    )

    print(
        "[PASS] coordinate transform self-test"
    )
