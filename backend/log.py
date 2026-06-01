"""Centralized logging configuration."""
import logging
from config import LOG_LEVEL


def setup_logging() -> None:
    """Initialize logging with the configured level and format."""
    logging.basicConfig(
        level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    # Suppress noisy third-party loggers
    logging.getLogger("borsapy").setLevel(logging.ERROR)
    logging.getLogger("urllib3").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Get a logger instance for the given module name."""
    return logging.getLogger(name)
