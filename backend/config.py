"""Application configuration loaded from environment variables."""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

CORS_ORIGINS: list[str] = os.getenv("CORS_ORIGINS", "*").split(",")
HOST: str = os.getenv("HOST", "0.0.0.0")
PORT: int = int(os.getenv("PORT", "8001"))
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
CACHE_DIR: Path = Path(os.getenv("CACHE_DIR", str(Path(__file__).parent / "cache")))
CACHE_TTL: int = int(os.getenv("CACHE_TTL", "86400"))
SCAN_CACHE_TTL: int = int(os.getenv("SCAN_CACHE_TTL", "3600"))
SCAN_MAX_WORKERS: int = int(os.getenv("SCAN_MAX_WORKERS", "10"))
WS_TIMEOUT: int = int(os.getenv("WS_TIMEOUT", "30"))
