import argparse
import json
from pathlib import Path

import nibabel as nib
import numpy as np
from scipy import ndimage
from radiomics import featureextractor


NUMERIC_FEATURES = [
    "tumor_volume_ml",
    "maximum_3d_diameter_mm",
    "maximum_axial_diameter_mm",
    "bbox_row_mm",
    "bbox_column_mm",
    "bbox_slice_mm",
    "surface_area_mm2_voxel_proxy",
    "sphericity_voxel_proxy",
    "elongation",
    "flatness",
    "centroid_axis0_normalized",
    "centroid_axis1_normalized",
    "centroid_axis2_normalized",
    "ct_hu_mean",
    "ct_hu_std",
    "ct_hu_min",
    "ct_hu_max",
    "ct_hu_p10",
    "ct_hu_p25",
    "ct_hu_median",
    "ct_hu_p75",
    "ct_hu_p90",
    "gtv1_component_count",
]


def get_float(result, key):
    value = result.get(key)

    if value is None:
        return None

    if hasattr(value, "item"):
        value = value.item()

    return float(value)


def build_shape_extractor():
    extractor = featureextractor.RadiomicsFeatureExtractor()
    extractor.disableAllFeatures()
    extractor.enableFeatureClassByName("shape")
    return extractor


def validate_geometry(ct_img, mask_img):
    if ct_img.shape != mask_img.shape:
        raise RuntimeError(
            f"Shape mismatch: CT={ct_img.shape}, mask={mask_img.shape}"
        )

    if not np.allclose(
        ct_img.affine,
        mask_img.affine,
        atol=1e-5,
    ):
        raise RuntimeError("CT / tumor mask affine mismatch")


def maximum_axial_diameter(mask, spacing_xyz):
    max_diameter = 0.0

    for z in range(mask.shape[2]):
        coords = np.argwhere(mask[:, :, z])

        if len(coords) < 2:
            continue

        x_min, y_min = coords.min(axis=0)
        x_max, y_max = coords.max(axis=0)

        dx = (x_max - x_min) * spacing_xyz[0]
        dy = (y_max - y_min) * spacing_xyz[1]

        diameter = float(
            np.sqrt(dx ** 2 + dy ** 2)
        )

        max_diameter = max(
            max_diameter,
            diameter,
        )

    return float(max_diameter)


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--ct",
        required=True,
    )

    parser.add_argument(
        "--tumor-mask",
        required=True,
    )

    parser.add_argument(
        "--output",
        required=True,
    )

    args = parser.parse_args()

    ct_path = Path(args.ct)
    mask_path = Path(args.tumor_mask)
    output_path = Path(args.output)

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    ct_img = nib.load(ct_path)
    mask_img = nib.load(mask_path)

    validate_geometry(
        ct_img,
        mask_img,
    )

    ct = np.asarray(
        ct_img.dataobj,
        dtype=np.float32,
    )

    mask = (
        np.asarray(mask_img.dataobj)
        > 0
    )

    if not mask.any():
        raise RuntimeError(
            "Tumor mask is empty"
        )

    spacing_xyz = np.asarray(
        nib.affines.voxel_sizes(ct_img.affine),
        dtype=np.float64,
    )

    voxel_volume_mm3 = float(
        np.prod(spacing_xyz)
    )

    structure = np.ones(
        (3, 3, 3),
        dtype=np.uint8,
    )

    labels, component_count = ndimage.label(
        mask,
        structure=structure,
    )

    coords = np.argwhere(mask)

    mins = coords.min(axis=0)
    maxs = coords.max(axis=0)

    bbox_size_vox = (
        maxs - mins + 1
    )

    bbox_size_mm = (
        bbox_size_vox
        * spacing_xyz
    )

    centroid = coords.mean(
        axis=0
    )

    shape_xyz = np.asarray(
        mask.shape,
        dtype=np.float64,
    )

    centroid_norm = (
        centroid
        / np.maximum(shape_xyz - 1.0, 1.0)
    )

    voxel_count = int(
        mask.sum()
    )

    volume_mm3 = (
        voxel_count
        * voxel_volume_mm3
    )

    tumor_hu = ct[mask]

    hu_stats = {
        "ct_hu_mean": float(
            np.mean(tumor_hu)
        ),
        "ct_hu_std": float(
            np.std(tumor_hu)
        ),
        "ct_hu_min": float(
            np.min(tumor_hu)
        ),
        "ct_hu_max": float(
            np.max(tumor_hu)
        ),
        "ct_hu_p10": float(
            np.percentile(tumor_hu, 10)
        ),
        "ct_hu_p25": float(
            np.percentile(tumor_hu, 25)
        ),
        "ct_hu_median": float(
            np.median(tumor_hu)
        ),
        "ct_hu_p75": float(
            np.percentile(tumor_hu, 75)
        ),
        "ct_hu_p90": float(
            np.percentile(tumor_hu, 90)
        ),
    }

    extractor = build_shape_extractor()

    result = extractor.execute(
        str(ct_path),
        str(mask_path),
        label=1,
    )

    maximum_3d_diameter = get_float(
        result,
        "original_shape_Maximum3DDiameter",
    )

    surface_area = get_float(
        result,
        "original_shape_SurfaceArea",
    )

    sphericity = get_float(
        result,
        "original_shape_Sphericity",
    )

    elongation = get_float(
        result,
        "original_shape_Elongation",
    )

    flatness = get_float(
        result,
        "original_shape_Flatness",
    )

    max_axial = maximum_axial_diameter(
        mask,
        spacing_xyz,
    )

    features = {
        "tumor_volume_ml": float(
            volume_mm3 / 1000.0
        ),

        "maximum_3d_diameter_mm":
            maximum_3d_diameter,

        "maximum_axial_diameter_mm":
            max_axial,

        "bbox_row_mm": float(
            bbox_size_mm[0]
        ),

        "bbox_column_mm": float(
            bbox_size_mm[1]
        ),

        "bbox_slice_mm": float(
            bbox_size_mm[2]
        ),

        "surface_area_mm2_voxel_proxy":
            surface_area,

        "sphericity_voxel_proxy":
            sphericity,

        "elongation":
            elongation,

        "flatness":
            flatness,

        "centroid_axis0_normalized":
            float(centroid_norm[0]),

        "centroid_axis1_normalized":
            float(centroid_norm[1]),

        "centroid_axis2_normalized":
            float(centroid_norm[2]),

        **hu_stats,

        "gtv1_component_count":
            int(component_count),
    }

    output = {
        "source_ct": str(ct_path),
        "source_tumor_mask": str(mask_path),

        "geometry": {
            "shape_xyz": [
                int(x)
                for x in ct.shape
            ],

            "spacing_xyz_mm": [
                float(x)
                for x in spacing_xyz
            ],

            "voxel_count": voxel_count,

            "centroid_voxel_xyz": [
                float(x)
                for x in centroid
            ],

            "bbox_min_xyz": [
                int(x)
                for x in mins
            ],

            "bbox_max_xyz": [
                int(x)
                for x in maxs
            ],
        },

        "features": features,

        "feature_notes": {
            "surface_area_mm2_voxel_proxy":
                "PyRadiomics original_shape_SurfaceArea",

            "sphericity_voxel_proxy":
                "PyRadiomics original_shape_Sphericity",

            "elongation":
                "PyRadiomics original_shape_Elongation",

            "flatness":
                "PyRadiomics original_shape_Flatness",

            "maximum_3d_diameter_mm":
                "PyRadiomics original_shape_Maximum3DDiameter",

            "maximum_axial_diameter_mm":
                "Maximum axial XY bounding-box diagonal across slices",
        },
    }

    with open(
        output_path,
        "w",
        encoding="utf-8",
    ) as f:
        json.dump(
            output,
            f,
            indent=2,
            ensure_ascii=False,
        )

    print("N TUMOR FEATURE EXTRACTION SUCCESS")
    print("Tumor voxels:", voxel_count)
    print("Components:", component_count)
    print("Volume mL:", features["tumor_volume_ml"])
    print(
        "Maximum 3D diameter mm:",
        features["maximum_3d_diameter_mm"],
    )
    print(
        "Maximum axial diameter mm:",
        features["maximum_axial_diameter_mm"],
    )
    print("Output:", output_path)


if __name__ == "__main__":
    main()

