import argparse
import csv
import json
import math
from pathlib import Path

import nibabel as nib
import numpy as np
from scipy import ndimage
from radiomics import featureextractor


def voxel_to_world(affine, xyz):
    p = np.array(
        [xyz[0], xyz[1], xyz[2], 1.0],
        dtype=np.float64,
    )
    world = affine @ p
    return [float(world[0]), float(world[1]), float(world[2])]


def equivalent_diameter(volume_mm3):
    if volume_mm3 <= 0:
        return 0.0
    return float((6.0 * volume_mm3 / math.pi) ** (1.0 / 3.0))


def build_shape_extractor():
    extractor = featureextractor.RadiomicsFeatureExtractor()
    extractor.disableAllFeatures()
    extractor.enableFeatureClassByName("shape")
    return extractor


def get_float(result, key):
    value = result.get(key)

    if value is None:
        return None

    if hasattr(value, "item"):
        value = value.item()

    return float(value)


def quantify(image_path, mask_path, output_dir):
    image_path = Path(image_path)
    mask_path = Path(mask_path)
    output_dir = Path(output_dir)

    output_dir.mkdir(parents=True, exist_ok=True)

    if not image_path.exists():
        raise FileNotFoundError(image_path)

    if not mask_path.exists():
        raise FileNotFoundError(mask_path)

    image_nii = nib.load(str(image_path))
    mask_nii = nib.load(str(mask_path))

    image = image_nii.get_fdata()
    mask = mask_nii.get_fdata() > 0

    if image.shape != mask.shape:
        raise RuntimeError(
            f"Shape mismatch: image={image.shape}, mask={mask.shape}"
        )

    if not np.allclose(
        image_nii.affine,
        mask_nii.affine,
        atol=1e-5,
    ):
        raise RuntimeError("Image/mask affine mismatch")

    affine = image_nii.affine
    spacing = nib.affines.voxel_sizes(affine)
    voxel_volume_mm3 = float(np.prod(spacing))

    # 26-connectivity
    structure = np.ones((3, 3, 3), dtype=np.uint8)

    labels, num_components = ndimage.label(
        mask,
        structure=structure,
    )

    print("Input image :", image_path)
    print("Input mask  :", mask_path)
    print("Shape       :", image.shape)
    print("Spacing XYZ :", tuple(float(x) for x in spacing))
    print("Components  :", num_components)

    if num_components == 0:
        raise RuntimeError("No foreground component found")

    components = []

    for label_id in range(1, num_components + 1):
        component = labels == label_id

        voxel_count = int(component.sum())
        if voxel_count == 0:
            continue

        coords = np.argwhere(component)

        centroid = coords.mean(axis=0)
        mins = coords.min(axis=0)
        maxs = coords.max(axis=0)

        volume_mm3 = voxel_count * voxel_volume_mm3

        components.append(
            {
                "source_label": label_id,
                "mask": component,
                "voxel_count": voxel_count,
                "volume_mm3_geometry": volume_mm3,
                "centroid": centroid,
                "bbox": [
                    int(mins[0]),
                    int(mins[1]),
                    int(mins[2]),
                    int(maxs[0]),
                    int(maxs[1]),
                    int(maxs[2]),
                ],
            }
        )

    # 가장 큰 component부터 N001
    components.sort(
        key=lambda x: x["volume_mm3_geometry"],
        reverse=True,
    )

    # Keep downstream nodule policy aligned with
    # segmentation / morphology / texture / malignancy.
    components = [
        comp
        for comp in components
        if equivalent_diameter(
            comp["volume_mm3_geometry"]
        ) >= 3.0
    ]

    extractor = build_shape_extractor()

    rows = []

    for idx, comp in enumerate(components, start=1):
        nodule_id = f"N{idx:03d}"

        temp_mask_path = (
            output_dir / f"_{nodule_id}_mask_tmp.nii.gz"
        )

        header = mask_nii.header.copy()
        header.set_data_dtype(np.uint8)

        component_nii = nib.Nifti1Image(
            comp["mask"].astype(np.uint8),
            affine=mask_nii.affine,
            header=header,
        )

        nib.save(
            component_nii,
            str(temp_mask_path),
        )

        try:
            result = extractor.execute(
                str(image_path),
                str(temp_mask_path),
                label=1,
            )

            surface_area = get_float(
                result,
                "original_shape_SurfaceArea",
            )

            sphericity = get_float(
                result,
                "original_shape_Sphericity",
            )

            maximum_3d_diameter = get_float(
                result,
                "original_shape_Maximum3DDiameter",
            )

            mesh_volume = get_float(
                result,
                "original_shape_MeshVolume",
            )

            voxel_volume = get_float(
                result,
                "original_shape_VoxelVolume",
            )

        except Exception as e:
            print(
                f"[WARN] {nodule_id} PyRadiomics failed: {e}"
            )

            surface_area = None
            sphericity = None
            maximum_3d_diameter = None
            mesh_volume = None
            voxel_volume = None

        finally:
            temp_mask_path.unlink(missing_ok=True)

        volume_mm3 = comp["volume_mm3_geometry"]

        eq_diameter = equivalent_diameter(volume_mm3)

        centroid_xyz = [
            float(x) for x in comp["centroid"]
        ]

        centroid_world = voxel_to_world(
            affine,
            centroid_xyz,
        )

        row = {
            "nodule_id": nodule_id,
            "voxel_count": int(comp["voxel_count"]),
            "volume_mm3": float(volume_mm3),
            "equivalent_diameter_mm": float(eq_diameter),
            "maximum_3d_diameter_mm": maximum_3d_diameter,
            "surface_area_mm2": surface_area,
            "sphericity": sphericity,
            "pyradiomics_mesh_volume_mm3": mesh_volume,
            "pyradiomics_voxel_volume_mm3": voxel_volume,
            "centroid_voxel_xyz": centroid_xyz,
            "centroid_world_xyz_mm": centroid_world,
            "bbox_voxel_xyz": comp["bbox"],
        }

        rows.append(row)

        print()
        print(f"[{nodule_id}]")
        print(" voxels      :", row["voxel_count"])
        print(" volume mm3  :", f"{row['volume_mm3']:.3f}")
        print(" eq diam mm  :", f"{row['equivalent_diameter_mm']:.3f}")
        print(
            " max3D mm    :",
            f"{maximum_3d_diameter:.3f}"
            if maximum_3d_diameter is not None
            else "None",
        )
        print(
            " surface mm2 :",
            f"{surface_area:.3f}"
            if surface_area is not None
            else "None",
        )
        print(
            " sphericity  :",
            f"{sphericity:.6f}"
            if sphericity is not None
            else "None",
        )
        print(
            " centroid XYZ:",
            [round(x, 3) for x in centroid_xyz],
        )
        print(
            " world XYZ mm:",
            [round(x, 3) for x in centroid_world],
        )
        print(" bbox XYZ    :", comp["bbox"])

    json_path = output_dir / "nodule_quantification.json"

    output = {
        "input_image": str(image_path),
        "input_mask": str(mask_path),
        "coordinate_system": {
            "array": "XYZ (NIfTI/nibabel)",
            "world": "XYZ mm",
        },
        "image_shape_xyz": [int(x) for x in image.shape],
        "spacing_xyz_mm": [float(x) for x in spacing],
        "component_connectivity": 26,
        "num_nodules": len(rows),
        "nodules": rows,
    }

    with open(
        json_path,
        "w",
        encoding="utf-8",
    ) as f:
        json.dump(
            output,
            f,
            indent=2,
        )

    csv_path = output_dir / "nodule_quantification.csv"

    csv_fields = [
        "nodule_id",
        "voxel_count",
        "volume_mm3",
        "equivalent_diameter_mm",
        "maximum_3d_diameter_mm",
        "surface_area_mm2",
        "sphericity",
        "pyradiomics_mesh_volume_mm3",
        "pyradiomics_voxel_volume_mm3",
        "centroid_voxel_xyz",
        "centroid_world_xyz_mm",
        "bbox_voxel_xyz",
    ]

    with open(
        csv_path,
        "w",
        newline="",
        encoding="utf-8",
    ) as f:
        writer = csv.DictWriter(
            f,
            fieldnames=csv_fields,
        )

        writer.writeheader()

        for row in rows:
            row_csv = dict(row)

            for key in [
                "centroid_voxel_xyz",
                "centroid_world_xyz_mm",
                "bbox_voxel_xyz",
            ]:
                row_csv[key] = json.dumps(
                    row_csv[key]
                )

            writer.writerow(row_csv)

    print()
    print("=" * 72)
    print("[PASS] Nodule quantification complete")
    print("=" * 72)
    print("Nodules:", len(rows))
    print("JSON   :", json_path)
    print("CSV    :", csv_path)


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--image",
        required=True,
    )

    parser.add_argument(
        "--mask",
        required=True,
    )

    parser.add_argument(
        "--output-dir",
        required=True,
    )

    args = parser.parse_args()

    quantify(
        args.image,
        args.mask,
        args.output_dir,
    )


if __name__ == "__main__":
    main()

