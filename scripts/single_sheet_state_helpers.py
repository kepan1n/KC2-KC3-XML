#!/usr/bin/env python3
from __future__ import annotations

import copy
from typing import Any


SINGLE_SHEET_BINDING_BUCKETS = ['xmlP', 'xml']


def strip_redundant_single_sheet_bindings(state: dict[str, Any]) -> dict[str, Any]:
    """
    Remove explicit sheet bindings that are redundant once a form is already
    reduced to exactly one active KS-2 sheet.

    This keeps legacy multi-sheet import safety intact, but makes active
    single-sheet state cleaner and less coupled to the old multi-sheet model.
    """
    stripped = copy.deepcopy(state)
    if len(stripped.get('ks2Sheets') or []) != 1:
        return stripped

    for section in ((stripped.get('holdbacks') or {}).get('sections') or []):
        section.pop('ks2SheetId', None)

    for bucket_name in SINGLE_SHEET_BINDING_BUCKETS:
        bucket = stripped.get(bucket_name) or {}
        settlement = bucket.get('settlement') or {}
        for row in settlement.get('manualRows') or []:
            row.pop('ks2SheetId', None)

    return stripped
