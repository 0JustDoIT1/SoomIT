import argparse
import json
from pathlib import Path


CANONICAL_ORDER = [
    "age",
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
    "primary_lobe_tumor_overlap_fraction",
    "airway_t4_proxy_minimum_distance_mm",
    "heart_pericardial_t4_proxy_minimum_distance_mm",
    "great_vessels_t4_proxy_minimum_distance_mm",
    "esophagus_t4_proxy_minimum_distance_mm",
    "vertebral_body_t4_proxy_minimum_distance_mm",
    "chest_wall_t3_proxy_minimum_distance_mm",
    "gender",
    "histology",
    "primary_lobe",
]


def normalize_gender(value):
    if value is None:
        return "unknown"

    v = str(value).strip().lower()

    if v in {"m", "male"}:
        return "male"

    if v in {"f", "female"}:
        return "female"

    return "unknown"


def normalize_histology(value):
    if value is None:
        return "unknown"

    v = str(value).strip().lower()

    aliases = {
        "luad": "adenocarcinoma",
        "adenocarcinoma": "adenocarcinoma",

        "lusc": "squamous cell carcinoma",
        "squamous": "squamous cell carcinoma",
        "squamous cell carcinoma":
            "squamous cell carcinoma",

        "large cell": "large cell",

        "nos": "nos",
        "other-not-specified": "nos",

        "unknown": "unknown",
    }

    return aliases.get(
        v,
        "unknown",
    )


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--tumor-features",
        required=True,
    )

    parser.add_argument(
        "--anatomy-features",
        required=True,
    )

    parser.add_argument(
        "--patient-id",
        required=True,
    )

    parser.add_argument(
        "--age",
        type=float,
        required=True,
    )

    parser.add_argument(
        "--gender",
        required=True,
    )

    parser.add_argument(
        "--histology",
        required=True,
    )

    parser.add_argument(
        "--output",
        required=True,
    )

    args = parser.parse_args()

    with open(
        args.tumor_features,
        encoding="utf-8",
    ) as f:
        tumor_data = json.load(f)

    with open(
        args.anatomy_features,
        encoding="utf-8",
    ) as f:
        anatomy_data = json.load(f)

    tumor_features = tumor_data[
        "features"
    ]

    anatomy_features = anatomy_data[
        "features"
    ]

    features = {}

    features["age"] = float(
        args.age
    )

    for key, value in tumor_features.items():
        features[key] = value

    for key, value in anatomy_features.items():
        features[key] = value

    features["gender"] = normalize_gender(
        args.gender
    )

    features["histology"] = normalize_histology(
        args.histology
    )

    missing = [
        key
        for key in CANONICAL_ORDER
        if key not in features
    ]

    if missing:
        raise RuntimeError(
            "Missing N features: "
            + ", ".join(missing)
        )

    ordered_features = {
        key: features[key]
        for key in CANONICAL_ORDER
    }

    categorical_ood_warning = (
        ordered_features["gender"]
        == "unknown"
    )

    output = {
        "patient_id": args.patient_id,

        "features": ordered_features,

        "feature_order": CANONICAL_ORDER,

        "feature_count": len(
            CANONICAL_ORDER
        ),

        "validation": {
            "all_34_keys_present":
                len(ordered_features) == 34,

            "categorical_ood_warning":
                categorical_ood_warning,
        },
    }

    output_path = Path(
        args.output
    )

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

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

    print(
        "N PAYLOAD BUILD SUCCESS"
    )

    print(
        "Feature count:",
        len(ordered_features),
    )

    print(
        "Gender:",
        ordered_features["gender"],
    )

    print(
        "Histology:",
        ordered_features["histology"],
    )

    print(
        "Primary lobe:",
        ordered_features["primary_lobe"],
    )

    print(
        "Output:",
        output_path,
    )


if __name__ == "__main__":
    main()

