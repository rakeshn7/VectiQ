"""Structured logging setup for VectiQ backend."""

import logging
import sys


def configure_logging(level: str = "INFO") -> None:
    """Configure application-wide console logging."""
    numeric_level = getattr(logging, level.upper(), logging.INFO)
    root_logger = logging.getLogger()

    if not root_logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter(
            fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        root_logger.addHandler(handler)

    root_logger.setLevel(numeric_level)


def get_logger(name: str) -> logging.Logger:
    """Return a named module logger."""
    return logging.getLogger(name)

