"""Runtime configuration, sourced from environment variables.

``CORS_ORIGINS``: comma-separated allowlist of browser origins; ``*`` allows all.
``APP_ENV``: informational only (``development`` or ``production``).

The service must boot with zero configuration, so every variable has a
development-friendly default (the Vite dev server on localhost:5173).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

DEFAULT_CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"


@dataclass(frozen=True)
class Settings:
    cors_origins: list[str] = field(
        default_factory=lambda: [item.strip() for item in DEFAULT_CORS_ORIGINS.split(",")]
    )
    app_env: str = "development"

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "Settings":
        env = os.environ if env is None else env
        raw = env.get("CORS_ORIGINS", DEFAULT_CORS_ORIGINS)
        origins = [item.strip() for item in raw.split(",") if item.strip()]
        if not origins:
            origins = [item.strip() for item in DEFAULT_CORS_ORIGINS.split(",")]
        return cls(cors_origins=origins, app_env=env.get("APP_ENV", "development"))
