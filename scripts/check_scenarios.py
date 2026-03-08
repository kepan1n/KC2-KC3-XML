#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.main import (  # noqa: E402
    _autogen_file_id,
    _conditional_required,
    _field_validation_errors,
    _impossible_combinations,
    _is_valid_file_id,
    _validate_id_builder,
    build_xml_from_values,
    validate_xml,
    XSD_PATH,
    ID_BUILDER_DEFAULTS,
)


def load_scenario(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if "values" not in data:
        raise ValueError(f"{path.name}: missing 'values'")
    return data


def check_one(path: Path, xsd: bool = False) -> tuple[bool, list[str]]:
    sc = load_scenario(path)
    values = dict(sc["values"])

    id_builder = dict(ID_BUILDER_DEFAULTS)
    id_builder_errors = _validate_id_builder(id_builder)
    values.setdefault("/Файл/@ИдФайл", _autogen_file_id(id_builder))
    values.setdefault("/Файл/@ВерсФорм", "1.00")
    values.setdefault("/Файл/Документ/@КНД", "1110335")

    errs: list[str] = []

    if id_builder_errors:
        errs.extend(id_builder_errors)

    if not _is_valid_file_id(values.get("/Файл/@ИдФайл", "")):
        errs.append("ИдФайл не соответствует шаблону")

    cond_missing = [(p, r) for p, r in _conditional_required(values) if not values.get(p)]
    if cond_missing:
        errs.extend([f"COND missing: {p} — {r}" for p, r in cond_missing])

    combo = _impossible_combinations(values)
    if combo:
        errs.extend([f"COMBO: {e}" for e in combo])

    field_errs = _field_validation_errors(values)
    if field_errs:
        errs.extend([f"FIELD: {e}" for e in field_errs])

    if xsd and not errs:
        root = build_xml_from_values(values)
        xsd_errors = validate_xml(root, XSD_PATH)
        if xsd_errors:
            errs.extend([f"XSD: {e}" for e in xsd_errors[:20]])

    return len(errs) == 0, errs


def main() -> int:
    parser = argparse.ArgumentParser(description="Check Sprint A scenarios")
    parser.add_argument("--dir", default=str(ROOT / "examples" / "scenarios"), help="Scenarios directory")
    parser.add_argument("--xsd", action="store_true", help="Also run XSD validation")
    args = parser.parse_args()

    sc_dir = Path(args.dir)
    files = sorted([p for p in sc_dir.glob("*.json")])
    if not files:
        print(f"No scenarios found in {sc_dir}")
        return 1

    failed = 0
    for p in files:
        ok, errs = check_one(p, xsd=args.xsd)
        status = "PASS" if ok else "FAIL"
        print(f"[{status}] {p.name}")
        if errs:
            for e in errs:
                print(f"  - {e}")
        if not ok:
            failed += 1

    print(f"\nSummary: total={len(files)} failed={failed} passed={len(files)-failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
