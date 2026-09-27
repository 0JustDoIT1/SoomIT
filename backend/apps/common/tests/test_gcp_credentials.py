from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase

from apps.common.gcp_credentials import configure_google_application_credentials


class GoogleApplicationCredentialsTests(TestCase):
    def test_uses_adc_when_no_file_is_configured(self):
        environment = {}

        source = configure_google_application_credentials(
            base_dir=Path("C:/project/backend"),
            environ=environment,
        )

        self.assertEqual(source, "adc")
        self.assertNotIn("GOOGLE_APPLICATION_CREDENTIALS", environment)

    def test_keeps_an_existing_external_file_as_an_absolute_path(self):
        with TemporaryDirectory() as directory:
            base_dir = Path(directory)
            credential = base_dir / "external-credential.json"
            credential.touch()
            environment = {"GOOGLE_APPLICATION_CREDENTIALS": credential.name}

            source = configure_google_application_credentials(
                base_dir=base_dir,
                environ=environment,
            )

        self.assertEqual(source, "file")
        self.assertEqual(
            environment["GOOGLE_APPLICATION_CREDENTIALS"],
            str(credential.resolve()),
        )

    def test_stale_file_reference_falls_back_to_adc_without_logging_the_path(self):
        environment = {"GOOGLE_APPLICATION_CREDENTIALS": "missing-secret.json"}

        with self.assertLogs("apps.common.gcp_credentials", level="WARNING") as captured:
            source = configure_google_application_credentials(
                base_dir=Path("C:/project/backend"),
                environ=environment,
            )

        self.assertEqual(source, "adc")
        self.assertNotIn("GOOGLE_APPLICATION_CREDENTIALS", environment)
        self.assertNotIn("missing-secret.json", " ".join(captured.output))
