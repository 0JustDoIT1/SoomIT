from __future__ import annotations

import hashlib
import tempfile
import unittest
from pathlib import Path

from artifact import verify_sha256


class ArtifactTests(unittest.TestCase):
    def test_accepts_matching_checkpoint_digest(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "model.pt"
            path.write_bytes(b"checkpoint")
            expected = hashlib.sha256(b"checkpoint").hexdigest()
            self.assertEqual(verify_sha256(path, expected), expected)

    def test_rejects_mismatched_checkpoint_digest(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "model.pt"
            path.write_bytes(b"wrong")
            with self.assertRaises(RuntimeError):
                verify_sha256(path, "0" * 64)


if __name__ == "__main__":
    unittest.main()
