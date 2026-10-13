"""Health endpoint and CORS configuration."""

from __future__ import annotations


def test_health_ok(real_client):
    response = real_client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"]
    assert body["deck_count"] == 3  # en-ja/de/fr-essentials


def test_health_is_json(real_client):
    response = real_client.get("/api/health")
    assert response.headers["content-type"].startswith("application/json")


def test_cors_allows_default_dev_origin(real_client):
    response = real_client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_ignores_unknown_origin(real_client):
    response = real_client.get("/api/health", headers={"Origin": "http://evil.example"})
    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


def test_responses_carry_nosniff_header(real_client):
    response = real_client.get("/api/health")
    assert response.headers["x-content-type-options"] == "nosniff"


def test_cors_preflight_allows_get_only(real_client):
    response = real_client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert "GET" in response.headers["access-control-allow-methods"]


def test_deck_endpoints_are_cacheable(real_client):
    for path in ("/api/decks", "/api/decks/en-fr", "/api/decks/en-fr/entries"):
        response = real_client.get(path)
        assert response.status_code == 200
        assert response.headers["cache-control"] == "public, max-age=60"


def test_health_is_not_cached(real_client):
    assert "cache-control" not in real_client.get("/api/health").headers


def test_cors_preflight_denies_post(real_client):
    response = real_client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.status_code == 400
    assert "POST" not in response.headers.get("access-control-allow-methods", "")


def test_openapi_schema_generates(real_client):
    response = real_client.get("/openapi.json")
    assert response.status_code == 200
    assert "/api/decks" in response.json()["paths"]
