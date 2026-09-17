import argparse
import json
import logging
import os
import subprocess
import sys
import time
from pathlib import Path


THIS_FILE = Path(__file__).resolve()

CT_ANALYSIS_PACKAGE_ROOT = THIS_FILE.parents[1]
PACKAGES_ROOT = CT_ANALYSIS_PACKAGE_ROOT.parent
BUNDLE_ROOT = PACKAGES_ROOT.parent

SEG_ROOT = (
    PACKAGES_ROOT
    / "final_segmentation_deploy_ready"
)

QUANT_ROOT = (
    PACKAGES_ROOT
    / "final_quantification_deploy_ready"
)

MORPH_ROOT = (
    PACKAGES_ROOT
    / "final_morphology_deploy_ready"
)

TEXTURE_ROOT = (
    PACKAGES_ROOT
    / "final_texture_deploy_ready"
)

MALIGNANCY_ROOT = (
    PACKAGES_ROOT
    / "final_malignancy_deploy_ready"
)

T_ROOT = (
    PACKAGES_ROOT
    / "final_t_input_deploy_ready"
)

N_ROOT = (
    PACKAGES_ROOT
    / "final_n_input_deploy_ready"
)

logger = logging.getLogger("uvicorn.error")


def log_latency(stage, started):
    logger.info(
        "latency service=ct_phase1 stage=%s elapsed_seconds=%.3f",
        stage,
        time.perf_counter() - started,
    )


def run(cmd, env=None):
    cmd = [str(x) for x in cmd]

    print()
    print("=" * 80)
    print("RUN")
    print(" ".join(cmd))
    print("=" * 80)

    subprocess.run(
        cmd,
        check=True,
        env=env,
    )


def anatomy_python():
    """Return the isolated TotalSegmentator interpreter when configured."""
    return os.environ.get("TOTALSEG_PYTHON")


# run_anatomy_segmentation.py's two --ml multi-label outputs. build_canonical_
# anatomy.py already extracts everything downstream needs from them (the 5 lung
# lobe masks under thoracic_total/, and the 7 canonical_anatomy/ masks), so
# nothing else reads these large intermediates again.
ANATOMY_MULTILABEL_FILES = (
    "thoracic_total_multilabel.nii.gz",
    "thoracic_total_multilabel.labelmap.json",
    "lung_vessels_multilabel.nii.gz",
    "lung_vessels_multilabel.labelmap.json",
)


def prune_intermediate_anatomy_masks(anatomy_dir):
    """Delete the raw TotalSegmentator multi-label volumes (and their label-map
    sidecars) once build_canonical_anatomy.py has extracted the final
    lobe/canonical masks from them. Metadata JSON files are left untouched.
    """
    for filename in ANATOMY_MULTILABEL_FILES:
        mask_path = anatomy_dir / filename
        if mask_path.exists():
            mask_path.unlink()


def load_json(path):
    path = Path(path)

    with open(
        path,
        "r",
        encoding="utf-8",
    ) as f:
        return json.load(f)


def save_json(data, path):
    path = Path(path)

    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with open(
        path,
        "w",
        encoding="utf-8",
    ) as f:
        json.dump(
            data,
            f,
            indent=2,
            ensure_ascii=False,
        )


def phase1(
    ct_path,
    case_id,
    output_dir,
    python_executable,
    totalseg_env,
    nodule_models=None,
):
    total_started = time.perf_counter()
    ct_path = Path(ct_path).resolve()
    output_dir = Path(output_dir).resolve()

    if not ct_path.exists():
        raise FileNotFoundError(
            ct_path
        )

    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    # --------------------------------------------------
    # DICOM input support
    #
    # --ct may point either at an already-converted NIfTI
    # file or at a directory holding a raw CT DICOM series.
    # When it is a directory, convert it to NIfTI first so
    # every downstream step keeps receiving a NIfTI path.
    # --------------------------------------------------

    if ct_path.is_dir():
        sys.path.insert(
            0,
            str(THIS_FILE.parent),
        )

        from dicom_to_nifti import (
            convert_dicom_series,
        )

        source_dir = (
            output_dir
            / "source"
        )

        source_dir.mkdir(
            parents=True,
            exist_ok=True,
        )

        converted_ct_path = (
            source_dir
            / f"{case_id}_0000.nii.gz"
        )

        dicom_metadata_path = (
            source_dir
            / "dicom_to_nifti_metadata.json"
        )

        convert_dicom_series(
            dicom_dir=ct_path,
            output_nifti=converted_ct_path,
            metadata_path=dicom_metadata_path,
        )

        ct_path = converted_ct_path

    # --------------------------------------------------
    # Output directories
    # --------------------------------------------------

    seg_dir = (
        output_dir
        / "segmentation"
    )

    quant_dir = (
        output_dir
        / "quantification"
    )

    nodule_dir = (
        output_dir
        / "nodules"
    )

    anatomy_dir = (
        output_dir
        / "anatomy"
    )

    canonical_dir = (
        output_dir
        / "canonical_anatomy"
    )

    t_input_dir = (
        output_dir
        / "t_input"
    )

    visualization_dir = (
        output_dir
        / "visualization"
    )

    cornerstone_dir = (
        output_dir
        / "cornerstone"
    )

    for d in [
        seg_dir,
        quant_dir,
        nodule_dir,
        anatomy_dir,
        canonical_dir,
        t_input_dir,
        visualization_dir,
        cornerstone_dir,
    ]:
        d.mkdir(
            parents=True,
            exist_ok=True,
        )

    # ==================================================
    # 1. Segmentation
    # ==================================================

    seg_mask = (
        seg_dir
        / f"{case_id}_seg.nii.gz"
    )

    seg_metadata = (
        seg_dir
        / "metadata.json"
    )

    stage_started = time.perf_counter()
    run([
        python_executable,
        SEG_ROOT / "code/inference.py",
        "--input",
        ct_path,
        "--output",
        seg_mask,
        "--metadata",
        seg_metadata,
    ])
    log_latency("segmentation", stage_started)

    segmentation = load_json(
        seg_metadata
    )

    # ==================================================
    # 2. Quantification
    # ==================================================

    stage_started = time.perf_counter()
    run([
        python_executable,
        QUANT_ROOT / "code/quantify_nodules.py",
        "--image",
        ct_path,
        "--mask",
        seg_mask,
        "--output-dir",
        quant_dir,
    ])
    log_latency("quantification", stage_started)

    quant_json = (
        quant_dir
        / "nodule_quantification.json"
    )

    quantification = load_json(
        quant_json
    )

    quant_by_id = {
        item["nodule_id"]: item
        for item in quantification["nodules"]
    }

    # ==================================================
    # 3. Nodule-level models
    # ==================================================

    nodule_results = []

    segmentation_patches = {
        item["nodule_id"]: item
        for item in segmentation[
            "nodule_patches"
        ]
    }

    if (
        set(segmentation_patches)
        != set(quant_by_id)
    ):
        raise RuntimeError(
            "Segmentation / quantification "
            "nodule ID mismatch:\n"
            f"seg={sorted(segmentation_patches)}\n"
            f"quant={sorted(quant_by_id)}"
        )

    nodule_jobs = []
    for nodule_id in sorted(segmentation_patches):
        patch = segmentation_patches[
            nodule_id
        ]

        this_dir = (
            nodule_dir
            / nodule_id
        )

        this_dir.mkdir(
            parents=True,
            exist_ok=True,
        )

        morphology_json = (
            this_dir
            / "morphology.json"
        )

        texture_json = (
            this_dir
            / "texture.json"
        )

        malignancy_json = (
            this_dir
            / "malignancy.json"
        )

        nodule_jobs.append({
            "nodule_id": nodule_id,
            "patch": patch,
            "morphology_json": morphology_json,
            "texture_json": texture_json,
            "malignancy_json": malignancy_json,
        })

    stage_started = time.perf_counter()
    if nodule_models is not None:
        model_started = time.perf_counter()
        nodule_models.run_morphology([
            {"ct": job["patch"]["morphology_ct"], "mask": job["patch"]["morphology_mask"],
             "output": job["morphology_json"]}
            for job in nodule_jobs
        ])
        log_latency("morphology", model_started)
        model_started = time.perf_counter()
        nodule_models.run_texture([
            {"ct": job["patch"]["morphology_ct"], "mask": job["patch"]["morphology_mask"],
             "output": job["texture_json"]}
            for job in nodule_jobs
        ])
        log_latency("texture", model_started)
        model_started = time.perf_counter()
        nodule_models.run_malignancy([
            {"input": job["patch"]["malignancy_ct"], "output": job["malignancy_json"]}
            for job in nodule_jobs
        ])
        log_latency("malignancy", model_started)
    else:
        for job in nodule_jobs:
            patch = job["patch"]
            run([python_executable, MORPH_ROOT / "code/inference.py", "--ct",
                 patch["morphology_ct"], "--mask", patch["morphology_mask"],
                 "--output", job["morphology_json"]])
            run([python_executable, TEXTURE_ROOT / "code/inference.py", "--ct",
                 patch["morphology_ct"], "--mask", patch["morphology_mask"],
                 "--output", job["texture_json"]])
            run([python_executable, MALIGNANCY_ROOT / "inference.py", "--input",
                 patch["malignancy_ct"], "--output", job["malignancy_json"]])
    log_latency("nodule_models", stage_started)

    for job in nodule_jobs:
        nodule_id = job["nodule_id"]
        patch = job["patch"]
        nodule_results.append({
            "nodule_id":
                nodule_id,
            "quantification":
                quant_by_id[nodule_id],
            "morphology":
                load_json(
                    job["morphology_json"]
                ),
            "texture":
                load_json(
                    job["texture_json"]
                ),
            "malignancy":
                load_json(
                    job["malignancy_json"]
                ),
            "patch_metadata":
                patch,
        })

    # ==================================================
    # 4. Thoracic anatomy
    #
    # TotalSegmentator is intentionally kept in the
    # separate "totalseg" conda environment.
    # ==================================================

    totalseg_python = anatomy_python()
    anatomy_prefix = (
        [totalseg_python]
        if totalseg_python
        else ["conda", "run", "-n", totalseg_env, "python"]
    )
    stage_started = time.perf_counter()
    run([
        *anatomy_prefix,
        N_ROOT / "code/run_anatomy_segmentation.py",
        "--ct",
        ct_path,
        "--case-id",
        case_id,
        "--output-dir",
        anatomy_dir,
        "--device",
        "gpu",
    ])
    log_latency("anatomy_segmentation", stage_started)

    anatomy_metadata = (
        anatomy_dir
        / "anatomy_metadata.json"
    )

    # ==================================================
    # 5. Canonical anatomy
    # ==================================================

    stage_started = time.perf_counter()
    run([
        python_executable,
        N_ROOT / "code/build_canonical_anatomy.py",
        "--anatomy-dir",
        anatomy_dir,
        "--output-dir",
        canonical_dir,
        "--case-id",
        case_id,
    ])
    log_latency("canonical_anatomy", stage_started)

    canonical_metadata = (
        canonical_dir
        / "canonical_anatomy_metadata.json"
    )

    # ==================================================
    # 6. T input
    #
    # T builder requires the 5 raw lobe masks.
    # These live directly in thoracic_total.
    # ==================================================

    lung_mask_dir = (
        anatomy_dir
        / "thoracic_total"
    )

    stage_started = time.perf_counter()
    run([
        python_executable,
        T_ROOT / "code/build_t_input.py",
        "--ct",
        ct_path,
        "--lung-mask-dir",
        lung_mask_dir,
        "--case-id",
        case_id,
        "--output-dir",
        t_input_dir,
        "--margin-mm",
        "50",
    ])
    log_latency("t_input", stage_started)

    t_input_path = (
        t_input_dir
        / f"{case_id}_0000.nii.gz"
    )

    t_metadata_path = (
        t_input_dir
        / "crop_metadata.json"
    )

    # ==================================================
    # 6.5 Prune intermediate anatomy masks
    #
    # canonical_anatomy/ (7 masks) already folds in everything Phase 2's
    # extract_anatomy_features.py and build_t_input.py need except the 5 raw
    # lung lobes, which build_t_input.py also already consumed above. The
    # remaining ~45 individual TotalSegmentator masks (ribs, vertebrae,
    # sternum, aorta, pulmonary_vein, heart, esophagus) and all 4 raw
    # lung_vessels masks are pure intermediates: nothing downstream reads them
    # again, and writing/uploading dozens of full-resolution NIfTI files is
    # the dominant cost of this pipeline for thick series. Drop them before
    # the caller uploads work_root to GCS.
    # ==================================================

    prune_intermediate_anatomy_masks(anatomy_dir)

    # ==================================================
    # 6.6 Web visualization artifacts
    #
    # Convert the retained segmentation/anatomy NIfTI masks into independent
    # GLB layers. This is inference post-processing; it does not alter any
    # model input or analytical result.
    # ==================================================

    stage_started = time.perf_counter()
    run([
        python_executable,
        BUNDLE_ROOT / "visualization.py",
        "--segmentation",
        seg_mask,
        "--lobe-dir",
        lung_mask_dir,
        "--canonical-dir",
        canonical_dir,
        "--output-dir",
        visualization_dir,
        "--case-id",
        case_id,
    ])
    log_latency("visualization", stage_started)

    visualization_manifest = load_json(
        visualization_dir / "visualization_manifest.json"
    )

    # ==================================================
    # 6.7 Cornerstone3D labelmap
    #
    # Same segmentation masks, converted into a single voxel labelmap that
    # Cornerstone3D can overlay on the original CT series. Also inference
    # post-processing; does not alter any model input or analytical result.
    # ==================================================

    stage_started = time.perf_counter()
    run([
        python_executable,
        BUNDLE_ROOT / "cornerstone_labelmap.py",
        "--segmentation",
        seg_mask,
        "--lobe-dir",
        lung_mask_dir,
        "--canonical-dir",
        canonical_dir,
        "--ct",
        ct_path,
        "--output-dir",
        cornerstone_dir,
        "--case-id",
        case_id,
    ])
    log_latency("cornerstone", stage_started)

    cornerstone_manifest = load_json(
        cornerstone_dir / "cornerstone_manifest.json"
    )

    # ==================================================
    # 7. Phase 1 result
    # ==================================================

    result = {
        "case_id":
            case_id,
        "phase":
            "CT_ANALYSIS_PHASE_1",
        "source_ct":
            str(ct_path),
        "segmentation": {
            "mask":
                str(seg_mask),
            "metadata":
                str(seg_metadata),
            "nodule_count":
                len(nodule_results),
        },
        "nodules":
            nodule_results,
        "quantification": {
            "json":
                str(quant_json),
        },
        "anatomy": {
            "root":
                str(anatomy_dir),
            "thoracic_total":
                str(
                    anatomy_dir
                    / "thoracic_total"
                ),
            "lung_vessels":
                str(
                    anatomy_dir
                    / "lung_vessels"
                ),
            "metadata":
                str(anatomy_metadata),
        },
        "canonical_anatomy": {
            "root":
                str(canonical_dir),
            "metadata":
                str(canonical_metadata),
        },
        "visualization": visualization_manifest,
        "cornerstone_segmentation": cornerstone_manifest,
        "t_input": {
            "nifti":
                str(t_input_path),
            "metadata":
                str(t_metadata_path),
            "status":
                "READY_FOR_T_MODEL",
        },
        "n_input": {
            "status":
                "WAITING_FOR_T_MODEL_MASK",
            "required_next_input":
                "T model primary_tumor mask "
                "restored to original CT geometry",
        },
    }

    result_path = (
        output_dir
        / "phase1_result.json"
    )

    save_json(
        result,
        result_path,
    )
    log_latency("total", total_started)

    print()
    print("=" * 80)
    print("CT ANALYSIS PHASE 1 SUCCESS")
    print("=" * 80)
    print("Case       :", case_id)
    print("Nodules    :", len(nodule_results))
    print("T input    :", t_input_path)
    print("Result JSON:", result_path)

    return result


def phase2(
    ct_path,
    case_id,
    patient_id,
    age,
    gender,
    histology,
    tumor_mask,
    phase1_dir,
    output_dir,
    python_executable,
):
    ct_path = Path(ct_path).resolve()
    tumor_mask = Path(
        tumor_mask
    ).resolve()

    phase1_dir = Path(
        phase1_dir
    ).resolve()

    output_dir = Path(
        output_dir
    ).resolve()

    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    if not ct_path.exists():
        raise FileNotFoundError(
            ct_path
        )

    if not tumor_mask.exists():
        raise FileNotFoundError(
            tumor_mask
        )

    anatomy_dir = (
        phase1_dir
        / "anatomy"
    )

    canonical_dir = (
        phase1_dir
        / "canonical_anatomy"
    )

    tumor_features = (
        output_dir
        / "tumor_features.json"
    )

    anatomy_features = (
        output_dir
        / "anatomy_features.json"
    )

    n_input = (
        output_dir
        / "n_input.json"
    )

    # ==================================================
    # 1. Tumor features
    # ==================================================

    run([
        python_executable,
        N_ROOT / "code/extract_tumor_features.py",
        "--ct",
        ct_path,
        "--tumor-mask",
        tumor_mask,
        "--output",
        tumor_features,
    ])

    # ==================================================
    # 2. Anatomy features
    # ==================================================

    run([
        python_executable,
        N_ROOT / "code/extract_anatomy_features.py",
        "--ct",
        ct_path,
        "--tumor-mask",
        tumor_mask,
        "--thoracic-total-dir",
        anatomy_dir / "thoracic_total",
        "--canonical-anatomy-dir",
        canonical_dir,
        "--output",
        anatomy_features,
    ])

    # ==================================================
    # 3. Canonical 34-feature N payload
    # ==================================================

    run([
        python_executable,
        N_ROOT / "code/build_n_payload.py",
        "--tumor-features",
        tumor_features,
        "--anatomy-features",
        anatomy_features,
        "--patient-id",
        patient_id,
        "--age",
        str(age),
        "--gender",
        gender,
        "--histology",
        histology,
        "--output",
        n_input,
    ])

    payload = load_json(
        n_input
    )

    result = {
        "case_id":
            case_id,
        "phase":
            "CT_ANALYSIS_PHASE_2",
        "source_ct":
            str(ct_path),
        "t_tumor_mask":
            str(tumor_mask),
        "tumor_features":
            str(tumor_features),
        "anatomy_features":
            str(anatomy_features),
        "n_input":
            str(n_input),
        "feature_count":
            payload.get(
                "feature_count"
            ),
        "status":
            "READY_FOR_N_MODEL",
    }

    result_path = (
        output_dir
        / "phase2_result.json"
    )

    save_json(
        result,
        result_path,
    )

    print()
    print("=" * 80)
    print("CT ANALYSIS PHASE 2 SUCCESS")
    print("=" * 80)
    print("Case       :", case_id)
    print(
        "Features   :",
        payload.get(
            "feature_count"
        ),
    )
    print("N input    :", n_input)
    print("Result JSON:", result_path)

    return result


def main():
    parser = argparse.ArgumentParser()

    sub = parser.add_subparsers(
        dest="phase",
        required=True,
    )

    # --------------------------------------------------
    # Phase 1
    # --------------------------------------------------

    p1 = sub.add_parser(
        "phase1"
    )

    p1.add_argument(
        "--ct",
        required=True,
        help=(
            "Path to a NIfTI CT file, or a directory "
            "containing a raw CT DICOM series (auto-"
            "converted to NIfTI before phase 1 runs)."
        ),
    )

    p1.add_argument(
        "--case-id",
        required=True,
    )

    p1.add_argument(
        "--output-dir",
        required=True,
    )

    p1.add_argument(
        "--totalseg-env",
        default="totalseg",
    )

    # --------------------------------------------------
    # Phase 2
    # --------------------------------------------------

    p2 = sub.add_parser(
        "phase2"
    )

    p2.add_argument(
        "--ct",
        required=True,
    )

    p2.add_argument(
        "--case-id",
        required=True,
    )

    p2.add_argument(
        "--patient-id",
        required=True,
    )

    p2.add_argument(
        "--age",
        type=float,
        required=True,
    )

    p2.add_argument(
        "--gender",
        required=True,
    )

    p2.add_argument(
        "--histology",
        required=True,
    )

    p2.add_argument(
        "--tumor-mask",
        required=True,
    )

    p2.add_argument(
        "--phase1-dir",
        required=True,
    )

    p2.add_argument(
        "--output-dir",
        required=True,
    )

    args = parser.parse_args()

    python_executable = (
        sys.executable
    )

    if args.phase == "phase1":
        phase1(
            ct_path=args.ct,
            case_id=args.case_id,
            output_dir=args.output_dir,
            python_executable=python_executable,
            totalseg_env=args.totalseg_env,
        )

    elif args.phase == "phase2":
        phase2(
            ct_path=args.ct,
            case_id=args.case_id,
            patient_id=args.patient_id,
            age=args.age,
            gender=args.gender,
            histology=args.histology,
            tumor_mask=args.tumor_mask,
            phase1_dir=args.phase1_dir,
            output_dir=args.output_dir,
            python_executable=python_executable,
        )


if __name__ == "__main__":
    main()
