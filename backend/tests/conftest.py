"""Shared fixtures for backend tests."""
import sys
from pathlib import Path

# Add backend dir to path so imports work
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from fastapi.testclient import TestClient
from main import app


@pytest.fixture(scope="module")
def client():
    """Provide a TestClient for the FastAPI app."""
    return TestClient(app)
