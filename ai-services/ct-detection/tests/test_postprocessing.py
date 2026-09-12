from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "code"))

from postprocessing import postprocess_candidates


class PostprocessingTests(unittest.TestCase):
    def test_score_threshold_controls_returned_boxes(self):
        geometry = {
            "spacing_xyz_mm": [1.0, 1.0, 1.0],
            "spacing_zyx_mm": [1.0, 1.0, 1.0],
            "origin_xyz_mm": [0.0, 0.0, 0.0],
            "direction": [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
        }
        metadata = {"original": geometry, "resampled": geometry}
        candidates = np.asarray(
            [
                [0, 0.98, 10, 20, 30, 6, 8, 10],
                [1, 0.70, 40, 50, 60, 6, 8, 10],
            ],
            dtype=np.float32,
        )

        rows, detections = postprocess_candidates(
            candidates,
            metadata,
            score_threshold=0.95,
        )

        self.assertEqual(rows.shape, (1, 8))
        self.assertEqual(len(detections), 1)
        self.assertAlmostEqual(detections[0]["score"], 0.98, places=5)
        self.assertEqual(
            detections[0]["physical_world"]["center_xyz_mm"],
            [30.0, 20.0, 10.0],
        )


if __name__ == "__main__":
    unittest.main()
