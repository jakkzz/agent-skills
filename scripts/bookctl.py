#!/usr/bin/env python3
"""Portable source-checkout entry point for Academic Book Studio."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "academic-book-core" / "src"))

from academic_book.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
