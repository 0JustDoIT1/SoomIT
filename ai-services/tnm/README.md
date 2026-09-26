# TNM model services

The TNM runtime is split by compute and model lifecycle:

- `tnm-t-serve` (GPU): consumes the existing CT Phase 1 `t_input_uri`, runs Dataset504, stores the tumor mask, and returns segmentation measurements. It exposes the mask bounding-box diagonal and a provisional size-only category, but leaves `t_candidate` empty until maximum diameter and invasion evidence are reviewed.
- `tnm-m-serve` (GPU): runs Dataset502 PET+CT lesion segmentation and exposes a full `/v1/analyze` pipeline: 2 mL connected components, 28-feature helper filtering, TotalSegmentator anatomy overlap, exact 20-feature aggregation, CatBoost-M, and the M rule engine.
- `tnm-serve` (CPU): runs locked CatBoost-N and the TNM9 stage candidate rule.

The TNM workflow must reuse the persisted CT Phase 1 artifact. It must not invoke CT Phase 1 again. CT Phase 2 consumes that artifact and the T mask to build the canonical N 34-feature payload.

`/v1/analyze` accepts the CT NIfTI persisted by the CT pipeline and exactly one PET source: an aligned SUVbw NIfTI object or a GCS prefix containing one PET DICOM series. For DICOM, quantitative BQML pixels are converted to SUVbw from the patient weight, injected dose, half-life, injection time, and scan time and resampled onto the CT grid. Missing or ambiguous quantitative metadata fails closed.

The handoff includes the locked helper model and exact 20-feature aggregation, but not the original source that generated all 28 lesion morphology fields. The service implements those fields in physical coordinates under `preprocessor_revision=m-image-features-v1`, persists lesion-level JSON, and requires a real PET/CT sample comparison before that preprocessing revision can be declared numerically equivalent to the research pipeline.

Automatic PET/CT candidates are returned as `indeterminate` imaging evidence. The model probability is a review signal and is never promoted directly to a confirmed cM category.

All returned categories are review candidates and require physician confirmation.

## GPU residency benchmark

`TNM_M_KEEP_NNUNET_ON_GPU` defaults to `false`, preserving CPU offload after
inference. Set it to `true` only on an isolated test revision to compare keeping
nnU-Net on the GPU. TotalSegmentator still runs after nnU-Net; retaining weights
therefore requires checking their combined peak GPU memory, even without parallel
inference. The option does not change model inputs, inference settings or outputs.

Logs record `model_to_cuda`, `model_to_cpu`, `inference`,
`mask_postprocessing_and_anatomy`, and `total` times. Compare repeated requests
with the same CT/PET inputs and dedicated benchmark output prefixes. Verify
segmentation arrays, features, predictions and memory usage before promotion.

Existing revision `00005-f4v` logs inspected on 2026-09-26 contain two completed
analyze requests: mean total 136.913 s, inference 22.825 s, and mask/anatomy
processing 76.923 s. Those logs contain no model transfer measurements, so they
cannot establish the benefit of disabling offload. Residency remains disabled
by default until the tagged-revision comparison is complete.
