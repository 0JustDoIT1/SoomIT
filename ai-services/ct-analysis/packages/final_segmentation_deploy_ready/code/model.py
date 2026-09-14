import os
import sys
import tempfile
from pathlib import Path


THIS_FILE = Path(__file__).resolve()

PACKAGE_ROOT = THIS_FILE.parents[1]

# .../CT_ANALYSIS_FULL_BUNDLE_v1.0.0
BUNDLE_ROOT = PACKAGE_ROOT.parents[1]

VISTA_ROOT = (
    BUNDLE_ROOT
    / "external"
    / "VISTA"
    / "vista3d"
)

CHECKPOINT_PATH = (
    PACKAGE_ROOT
    / "model"
    / "vista3d_lidc_best.pt"
)

CONFIG_TEMPLATE = (
    PACKAGE_ROOT
    / "config"
    / "infer_bundle_template.yaml"
)


class Vista3DModel:
    def __init__(
        self,
        vista_root=VISTA_ROOT,
        checkpoint_path=CHECKPOINT_PATH,
        config_template=CONFIG_TEMPLATE,
    ):
        self.vista_root = Path(vista_root).resolve()
        self.checkpoint_path = Path(checkpoint_path).resolve()
        self.config_template = Path(config_template).resolve()

        if not self.vista_root.exists():
            raise FileNotFoundError(
                f"VISTA root not found: {self.vista_root}"
            )

        if not self.checkpoint_path.exists():
            raise FileNotFoundError(
                f"VISTA checkpoint not found: {self.checkpoint_path}"
            )

        if not self.config_template.exists():
            raise FileNotFoundError(
                f"VISTA config not found: {self.config_template}"
            )

        if str(self.vista_root) not in sys.path:
            sys.path.insert(0, str(self.vista_root))

        # Cloud Run writable filesystem:
        # use /tmp for runtime-generated files.
        runtime_root = (
            Path(tempfile.gettempdir())
            / "ct_analysis"
            / "vista3d"
        )

        runtime_root.mkdir(
            parents=True,
            exist_ok=True,
        )

        output_dir = runtime_root / "predictions"
        output_dir.mkdir(
            parents=True,
            exist_ok=True,
        )

        log_file = (
            runtime_root
            / "inference.log"
        )

        config_file = (
            runtime_root
            / f"infer_{os.getpid()}.yaml"
        )

        text = self.config_template.read_text(
            encoding="utf-8"
        )

        lines = []

        for line in text.splitlines():
            stripped = line.strip()

            if stripped.startswith("bundle_root:"):
                line = (
                    f"bundle_root: '{PACKAGE_ROOT}'"
                )

            elif stripped.startswith("ckpt_name:"):
                indent = line[
                    : len(line) - len(line.lstrip())
                ]
                line = (
                    f"{indent}ckpt_name: "
                    f"'{self.checkpoint_path}'"
                )

            elif stripped.startswith("output_path:"):
                indent = line[
                    : len(line) - len(line.lstrip())
                ]
                line = (
                    f"{indent}output_path: "
                    f"'{output_dir}'"
                )

            elif stripped.startswith("log_output_file:"):
                indent = line[
                    : len(line) - len(line.lstrip())
                ]
                line = (
                    f"{indent}log_output_file: "
                    f"'{log_file}'"
                )

            lines.append(line)

        config_file.write_text(
            "\n".join(lines) + "\n",
            encoding="utf-8",
        )

        from scripts.infer import InferClass

        self.inferer = InferClass(
            config_file=str(config_file)
        )

    def predict(self, image_file):
        image_file = Path(image_file).resolve()

        if not image_file.exists():
            raise FileNotFoundError(
                f"Input CT not found: {image_file}"
            )

        return self.inferer.infer(
            image_file=str(image_file),
            label_prompt=[23],
            save_mask=False,
        )

