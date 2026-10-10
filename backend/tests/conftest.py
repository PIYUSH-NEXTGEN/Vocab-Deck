"""Shared pytest fixtures."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.main import create_app  # noqa: E402

MIGRATION_CORRECTIONS = {
    "Warning": "warning",
    "Wait": "wait",
    "Stop": "stop",
    "Earth": "earth",
}


@pytest.fixture()
def real_client() -> TestClient:
    """Client against the real, version-controlled built-in decks."""
    return TestClient(create_app())


@pytest.fixture()
def build_client(tmp_path):
    """Build a client backed by an arbitrary set of deck files.

    Usage: client = build_client({"demo.json": json_text})
    """
    counter = {"n": 0}

    def build(files: dict[str, str]) -> TestClient:
        counter["n"] += 1
        data_dir = tmp_path / f"decks-{counter['n']}"
        data_dir.mkdir()
        for name, content in files.items():
            (data_dir / name).write_text(content, encoding="utf-8")
        return TestClient(create_app(data_dir=data_dir))

    return build


@pytest.fixture()
def deck_payload():
    """Factory for a minimal valid JSON deck payload."""
    return _deck_payload


def _deck_payload(**overrides) -> dict:
    """A minimal valid JSON deck payload, overridable per test."""
    payload = {
        "id": "demo",
        "name": "Demo Deck",
        "description": "A deck used in tests",
        "source_language": "en",
        "target_language": "es",
        "entries": [
            {"id": "hello", "source": "hello", "target": "hola"},
            {
                "id": "thank-you",
                "source": "thank you",
                "target": "gracias",
                "alternatives": ["gracias a ti"],
                "tags": ["phrase"],
            },
        ],
    }
    payload.update(overrides)
    return payload
