import io
import unittest

import torch

from app.predictor import InvalidFeatureFile, PDL1Predictor


class FakeModel:
    def __call__(self, features: torch.Tensor) -> dict[str, torch.Tensor]:
        assert tuple(features.shape[1:]) == (2, 2560)
        return {"logits": torch.tensor([[0.1, 0.2, 2.0]])}


def serialize(data: object) -> bytes:
    buffer = io.BytesIO()
    torch.save(data, buffer)
    return buffer.getvalue()


class PredictorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.predictor = PDL1Predictor.__new__(PDL1Predictor)
        self.predictor.device = torch.device("cpu")
        self.predictor.max_patches = 5000
        self.predictor.model = FakeModel()

    def test_predicts_three_class_result_without_numeric_tps(self) -> None:
        content = serialize(
            {
                "features": torch.ones((2, 2560)),
                "main_index": "patient-1",
                "pdl1_image_id": "slide-1",
            }
        )

        result = self.predictor.predict_bytes(content)

        self.assertEqual(result["predicted_class"], 2)
        self.assertEqual(result["predicted_tps_range"], "GE_50")
        self.assertEqual(result["predicted_tps_range_label"], "≥50%")
        self.assertNotIn("tps_percent", result)
        self.assertAlmostEqual(sum(result["probabilities"].values()), 1.0)

    def test_rejects_wrong_feature_shape(self) -> None:
        content = serialize({"features": torch.ones((2, 1280))})

        with self.assertRaisesRegex(InvalidFeatureFile, r"\[N, 2560\]"):
            self.predictor.predict_bytes(content)

    def test_rejects_non_finite_features(self) -> None:
        features = torch.ones((2, 2560))
        features[0, 0] = torch.nan

        with self.assertRaisesRegex(InvalidFeatureFile, "유한한 실수"):
            self.predictor.predict_bytes(serialize({"features": features}))

    def test_rejects_unsafe_or_invalid_serialized_content(self) -> None:
        with self.assertRaisesRegex(InvalidFeatureFile, "PyTorch feature"):
            self.predictor.predict_bytes(b"not-a-pt")


if __name__ == "__main__":
    unittest.main()
