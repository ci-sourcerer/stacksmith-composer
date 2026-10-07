import os
from pathlib import Path

import common_python_tasks
import pytest


def main() -> int:
    """Run the project test suite without loading local GitHub credentials.

    Returns:
        Pytest's process exit code.
    """
    os.environ.pop("COMPOSER_GITHUB_CLIENT_ID", None)
    os.environ.pop("COMPOSER_GITHUB_CLIENT_SECRET", None)
    shared_config = Path(common_python_tasks.__file__).parent / "data" / "generic"
    return pytest.main(
        [
            "-vv",
            "-c",
            str(shared_config / "pytest.ini"),
            "--cov=stacksmith_composer",
            "--cov-report=term-missing",
            "--cov-report=xml:coverage.xml",
            f"--cov-config={shared_config / '.coveragerc'}",
        ]
    )
