# Med3D ResNet18 Malignancy Model

## Input

### Model input

- 3D nodule block (.npy)
- metadata (.npy)
- metadata must contain spacing

### Detection linkage

To generate the malignancy model input from a detection result:

- nodule center must be provided in original CT physical/world coordinates
  - center_x_mm
  - center_y_mm
  - center_z_mm
- original CT is cropped around this center

## Preprocessing

1. Crop a 50 x 50 x 50 mm physical volume centered on the detected nodule
2. Resample to 64 x 64 x 64
3. Target spacing: 0.78125 x 0.78125 x 0.78125 mm
4. HU clipping: -1000 ~ 400
5. Linear normalization to 0 ~ 1

## Model

- Architecture: 3D ResNet18
- Initialization: Med3D / MedicalNet pretrained weights
- Input tensor shape: 1 x 64 x 64 x 64

## Output

- probability
- malignancy_score
- prediction
- threshold

Example:

{
"probability": 0.8421,
"malignancy_score": 84.21,
"prediction": "MALIGNANT",
"threshold": 0.5
}

## Output definition

- probability: sigmoid output in the range 0 ~ 1
- malignancy_score: probability x 100
- prediction:
  - probability >= 0.5 → MALIGNANT
  - probability < 0.5 → BENIGN

## Important

The malignancy score is derived directly from the sigmoid output.
Probability calibration has not yet been applied.

