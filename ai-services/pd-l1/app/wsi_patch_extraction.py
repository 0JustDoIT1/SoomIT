
import xml.etree.ElementTree as ET

import numpy as np
import openslide

from shapely.geometry import Polygon, Point
from PIL import Image


TARGET_MPP = 0.5
OUTPUT_PATCH_SIZE = 224

MIN_PATCHES = 50
MAX_PATCHES = 5000
RANDOM_SEED = 42


def get_roi_polygons(
    annotation_path,
    roi_layer
):
    tree = ET.parse(annotation_path)
    root = tree.getroot()

    polygons = []

    for ann in root.findall("./Annotation"):

        if ann.attrib.get("Name") != roi_layer:
            continue

        for region in ann.findall(".//Region"):

            vertices = [
                (
                    float(v.attrib["X"]),
                    float(v.attrib["Y"])
                )
                for v in region.findall(".//V")
            ]

            if len(vertices) >= 3:
                polygons.append(vertices)

    if not polygons:
        raise RuntimeError(
            f"ROI layer '{roi_layer}'에서 "
            "polygon을 찾지 못했습니다."
        )

    return polygons


def get_source_patch_px(slide):

    mpp = slide.properties.get(
        "openslide.mpp-x"
    )

    if mpp is None:
        raise RuntimeError(
            "WSI에 openslide.mpp-x 정보가 없습니다."
        )

    mpp = float(mpp)

    source_patch_px = int(
        round(
            OUTPUT_PATCH_SIZE
            * TARGET_MPP
            / mpp
        )
    )

    return (
        mpp,
        source_patch_px
    )


def generate_coords(
    polygons,
    source_patch_px,
    stride
):
    coords = []

    for vertices in polygons:

        poly = Polygon(vertices)

        if not poly.is_valid:
            poly = poly.buffer(0)

        if poly.is_empty:
            continue

        min_x, min_y, max_x, max_y = (
            poly.bounds
        )

        for y in range(
            int(min_y),
            int(max_y),
            stride
        ):

            for x in range(
                int(min_x),
                int(max_x),
                stride
            ):

                cx = (
                    x
                    + source_patch_px / 2
                )

                cy = (
                    y
                    + source_patch_px / 2
                )

                if poly.contains(
                    Point(cx, cy)
                ):

                    coords.append(
                        (x, y)
                    )

    return list(
        dict.fromkeys(coords)
    )


def generate_adaptive_patch_coords(
    polygons,
    source_patch_px
):

    # 1단계: overlap 없음
    stride = source_patch_px

    coords = generate_coords(
        polygons,
        source_patch_px,
        stride
    )

    # 2단계: 50개 미만이면 50% overlap
    if len(coords) < MIN_PATCHES:

        stride = max(
            1,
            source_patch_px // 2
        )

        coords = generate_coords(
            polygons,
            source_patch_px,
            stride
        )

    # 3단계: 그래도 50개 미만이면 75% overlap
    if len(coords) < MIN_PATCHES:

        stride = max(
            1,
            source_patch_px // 4
        )

        coords = generate_coords(
            polygons,
            source_patch_px,
            stride
        )

    raw_count = len(coords)

    # 최대 5000개
    if len(coords) > MAX_PATCHES:

        rng = np.random.default_rng(
            RANDOM_SEED
        )

        selected_idx = rng.choice(
            len(coords),
            MAX_PATCHES,
            replace=False
        )

        coords = [
            coords[i]
            for i in selected_idx
        ]

    return {
        "coords": coords,
        "final_stride": stride,
        "raw_patch_count": raw_count,
        "final_patch_count": len(coords)
    }


def prepare_wsi(
    wsi_path,
    annotation_path,
    roi_layer
):

    slide = openslide.OpenSlide(
        str(wsi_path)
    )

    mpp, source_patch_px = (
        get_source_patch_px(
            slide
        )
    )

    polygons = get_roi_polygons(
        annotation_path,
        roi_layer
    )

    patch_info = (
        generate_adaptive_patch_coords(
            polygons,
            source_patch_px
        )
    )

    return {
        "slide": slide,
        "mpp": mpp,
        "source_patch_px":
            source_patch_px,
        "polygons":
            polygons,
        **patch_info
    }


def read_patch(
    slide,
    x,
    y,
    source_patch_px
):

    patch = slide.read_region(
        (
            int(x),
            int(y)
        ),
        0,
        (
            source_patch_px,
            source_patch_px
        )
    ).convert("RGB")

    if patch.size != (
        OUTPUT_PATCH_SIZE,
        OUTPUT_PATCH_SIZE
    ):

        patch = patch.resize(
            (
                OUTPUT_PATCH_SIZE,
                OUTPUT_PATCH_SIZE
            ),
            Image.Resampling.LANCZOS
        )

    return patch
