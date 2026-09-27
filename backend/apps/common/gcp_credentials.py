import logging
import os
from pathlib import Path


logger = logging.getLogger(__name__)


def configure_google_application_credentials(*, base_dir, environ=None):
    """Prefer an existing external credential file, otherwise use Google ADC.

    Google client libraries already discover local ADC and runtime service
    accounts. A stale GOOGLE_APPLICATION_CREDENTIALS value prevents that
    discovery, so remove only invalid file references without logging paths.
    """
    environment = os.environ if environ is None else environ
    configured = environment.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    if not configured:
        environment.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
        return "adc"

    path = Path(configured).expanduser()
    if not path.is_absolute():
        path = Path(base_dir) / path
    path = path.resolve()
    if path.is_file():
        environment["GOOGLE_APPLICATION_CREDENTIALS"] = str(path)
        return "file"

    environment.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
    logger.warning(
        "Configured Google application credential file is unavailable; "
        "falling back to Application Default Credentials."
    )
    return "adc"
