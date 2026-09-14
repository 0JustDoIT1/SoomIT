import tempfile
import unittest
from pathlib import Path

import torch

from app.models import CLAM, load_clam


class ModelTests(unittest.TestCase):
    def test_checkpoint_round_trip_and_shapes(self):
        source = CLAM(num_classes=3)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.pt"
            torch.save(source.state_dict(), path)
            loaded = load_clam(str(path), num_classes=3, device=torch.device("cpu"))
        logits, attention = loaded(torch.randn(7, 1536))
        self.assertEqual(tuple(logits.shape), (3,))
        self.assertEqual(tuple(attention.shape), (7,))
        self.assertAlmostEqual(float(attention.sum()), 1.0, places=5)
