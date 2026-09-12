# CPMNetv2 Detection Coordinate System

## 1. Internal CT Array

NumPy CT volume:

[Z, Y, X]

Example:

volume[z, y, x]

## 2. Detection Output

CPMNetv2 detection center:

[z, y, x]

Detection size:

[d, h, w]

Deployment raw format:

[object_id, score, z, y, x, d, h, w]

## 3. SimpleITK

SimpleITK uses:

[X, Y, Z]

for:
- Size
- Spacing
- Origin
- Index
- Physical point

## 4. World Coordinate

World / patient physical coordinates:

[X, Y, Z] mm

Transformation:

physical_xyz
=
origin_xyz
+
direction_matrix
@
(index_xyz * spacing_xyz)

Inverse:

index_xyz
=
inverse(direction_matrix)
@
(physical_xyz - origin_xyz)
/
spacing_xyz

## 5. Geometry Metadata

Always preserve:
- size
- spacing
- origin
- direction

for:
- original CT
- resampled detection CT

## 6. Detection Coordinate Flow

CPMNetv2 output
resampled voxel ZYX
        ↓
world XYZ mm
        ↓
original CT voxel XYZ / ZYX

World XYZ is the reference coordinate for viewer integration.

## 7. Viewer

Viewer annotations use:

patient physical XYZ mm

Primary fields:
- center_world_xyz_mm
- bbox_world.corners_xyz_mm

