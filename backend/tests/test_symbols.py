"""Tests for symbol listing and search endpoints."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_get_symbols():
    """GET /api/symbols should return stocks and indices lists."""
    response = client.get("/api/symbols")
    assert response.status_code == 200
    data = response.json()
    assert "stocks" in data
    assert "indices" in data
    assert len(data["stocks"]) > 0


def test_get_symbols_has_name_field():
    """Each stock entry should have a 'name' field."""
    response = client.get("/api/symbols")
    data = response.json()
    first_stock = data["stocks"][0]
    assert "name" in first_stock


def test_get_symbols_has_display_name():
    """Each stock entry should also have a 'displayName' field."""
    response = client.get("/api/symbols")
    data = response.json()
    first_stock = data["stocks"][0]
    assert "displayName" in first_stock


def test_search_requires_query():
    """GET /api/search without query parameter should return 422."""
    response = client.get("/api/search")
    assert response.status_code == 422


def test_search_with_query():
    """GET /api/search?q=THY should return results list."""
    response = client.get("/api/search", params={"q": "THY"})
    assert response.status_code == 200
    data = response.json()
    assert "results" in data


def test_search_with_short_query():
    """GET /api/search?q= (empty) should return 422 due to min_length=1."""
    response = client.get("/api/search", params={"q": ""})
    assert response.status_code == 422
