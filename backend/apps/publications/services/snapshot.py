"""Canonical metadata snapshot and its integrity seal (plan section 4.5).

Every formal submission freezes the exact metadata of that iteration.
The canonical JSON — sorted keys, UTF-8, no unnecessary whitespace —
is what ``metadata.json`` stores and what ``metadata_sha256`` seals, so
``verify_integrity`` (TSK-76) can recompute the same digest later.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from apps.publications.models import Manuscript
from apps.users.models import AcademicArea


def build_metadata_snapshot(manuscript: Manuscript) -> dict[str, Any]:
    """Title, abstract, keywords, careers, language and the full author list."""
    return {
        "title": manuscript.title,
        "abstract": manuscript.abstract,
        "keywords": list(manuscript.keywords),
        "areas": [
            {"code": area.code, "name": area.name}
            for area in manuscript.areas.order_by("code")
        ],
        "language": manuscript.language,
        "authors": [
            {
                "order": author.author_order,
                "full_name": author.full_name,
                "email": author.email,
                "affiliation": author.affiliation,
                "is_corresponding": author.is_corresponding,
            }
            for author in manuscript.authors.order_by("author_order")
        ],
    }


def canonical_json(snapshot: dict[str, Any]) -> str:
    """Sorted keys, UTF-8 characters kept as they are, compact separators."""
    return json.dumps(snapshot, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def metadata_sha256(canonical: str) -> str:
    """Hex SHA-256 of the canonical JSON encoded as UTF-8."""
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def normalized_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    """The snapshot with ``areas``: the legacy ``area`` text becomes its catalog career.

    Snapshots written before the catalog carry ``area`` (free text). To tell
    whether a new version changed the metadata, that text is compared as the
    career with the same name (case and spacing aside). A text with no
    equivalent career stays as a one-item list with an empty ``code``.
    """
    if "areas" in snapshot or "area" not in snapshot:
        return snapshot
    legacy = " ".join(str(snapshot["area"]).split())
    area = next(
        (
            row
            for row in AcademicArea.objects.all()
            if " ".join(row.name.split()).lower() == legacy.lower()
        ),
        None,
    )
    areas = [{"code": area.code, "name": area.name}] if area else [{"code": "", "name": legacy}]
    migrated = {key: value for key, value in snapshot.items() if key != "area"}
    migrated["areas"] = areas
    return migrated
