# CPMNetv2 HN25 Detection Deployment Artifacts

## Model

Final selected detection model:

CPMNetv2 + Hard Negative 25%

Final validation CPM:

0.712925

Final postprocessing:

Crop NMS  = 0.05
Final NMS = 0.05
Top-K     = 300

Checkpoint:

../final_detection_research/model/best_val_loss.pt

# Pipeline

Original CT
    ↓
preprocessing.py
    ↓
1 mm isotropic CT
HU [-1200,600]
[-1,1]
    ↓
inference.py
    ↓
CPMNetv2 raw candidates
    ↓
postprocessing.py
    ↓
Final NMS / Top-K
Coordinate transform
    ↓
final_detections.json
    └── visualization.py
           ↓
        doctor/viewer visualization

# Files

## model.py

Loads the final CPMNetv2 architecture and checkpoint.

## preprocessing.py

Supports:
- NIfTI
- DICOM Series

Performs:
- 1 × 1 × 1 mm resampling
- HU [-1200,600]
- [-1,1] normalization

Preserves:
- shape
- spacing
- origin
- direction

## inference.py

Performs:
- SplitComb
- CPMNetv2 inference
- crop-level postprocessing
- raw candidate combination

Does not perform final NMS.

## postprocessing.py

Performs:
- Final NMS = 0.05
- Top-K = 300
- nodule_id assignment
- coordinate conversion

Produces:
- final_candidates.npz
- final_detections.json

## coordinate_transform.py

Transforms:

resampled voxel ZYX
↔
world XYZ mm
↔
original voxel coordinates

## visualization.py

Produces operational visualization:
- axial
- coronal
- sagittal
- 3D bbox preview
- viewer_annotations.json

No GT is required.

# Detection Input

Supported input:
- NIfTI .nii
- NIfTI .nii.gz
- DICOM Series directory

# Coordinate Convention

NumPy          = ZYX
Detection      = center ZYX / size DHW
SimpleITK      = XYZ
World          = XYZ mm

