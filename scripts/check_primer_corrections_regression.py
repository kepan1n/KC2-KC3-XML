#!/usr/bin/env python3
from __future__ import annotations

from decimal import Decimal, InvalidOperation
from pathlib import Path
import sys

from lxml import etree as ET

ROOT = Path(__file__).resolve().parents[1]
INPUT_JSON = ROOT / 'saved-forms' / 'primer-zapolneniya.json'
XSD_PATH = ROOT / 'nalog docs' / 'ON_AKTREZRABP_1_971_01_01_00_03.xsd'
SECTION_TOTAL_ATTRS = [
    'СтБезНДСРаздСмет',
    'СтСНДСРаздСмет',
    'СтБезНДСРаздОтч',
    'СтСНДСРаздОтч',
    'СтБезНДСРаздСНач',
    'СтСНДСРаздСНач',
]

sys.path.insert(0, str(ROOT / 'scripts'))
from generate_xml_from_export import build_xml_exports_by_ks2_sheet, load_json  # noqa: E402


def parse_decimal(text: str | None) -> Decimal | None:
    if text in (None, ''):
        return None
    try:
        return Decimal(str(text))
    except (InvalidOperation, ValueError) as exc:
        raise AssertionError(f'Invalid decimal value: {text!r}') from exc


def render_xml_bytes(tree: ET._ElementTree) -> bytes:
    return ET.tostring(tree, encoding='windows-1251', xml_declaration=True, pretty_print=True)


def ensure_valid_against_xsd(xml_bytes: bytes, label: str) -> ET._Element:
    schema = ET.XMLSchema(ET.parse(str(XSD_PATH)))
    xml_doc = ET.fromstring(xml_bytes)
    if not schema.validate(xml_doc):
        errors = '\n'.join(f'line {err.line}: {err.message}' for err in schema.error_log)
        raise AssertionError(f'{label}: INVALID against XSD\n{errors}')
    return xml_doc


def ensure_non_negative_section_totals(xml_doc: ET._Element, label: str):
    violations: list[str] = []
    for section in xml_doc.xpath('.//Раздел'):
        section_name = section.get('НаимРазд') or section.get('ИдРазд') or '<без названия>'
        for attr in SECTION_TOTAL_ATTRS:
            value = parse_decimal(section.get(attr))
            if value is not None and value < 0:
                violations.append(f'{label}: Раздел {section_name!r}, {attr}={value}')
    if violations:
        raise AssertionError('Negative section totals found:\n' + '\n'.join(violations))


def ensure_correction_rows_are_mapped(xml_doc: ET._Element, label: str) -> tuple[int, int]:
    correction_rows = xml_doc.xpath('.//СвВидРаб[@ПрИспрОш="1" or @ПрНовОбст="1"]')
    new_circumstances_rows = xml_doc.xpath('.//СвВидРаб[@ПрНовОбст="1"]')

    for work in correction_rows:
        work_name = work.get('НаимТов') or work.get('НомСтр') or '<без имени>'
        change = work.find('./УчОшИНовОбстСт/ОшибПрПер')
        if change is None:
            change = work.find('./УчОшИНовОбстСт/НовОбстПрПер')
        if change is None:
            raise AssertionError(f'{label}: correction row {work_name!r} is missing УчОшИНовОбстСт/*')

        amount_delta = parse_decimal(change.findtext('УменьшДен'))
        if amount_delta is None or amount_delta <= 0:
            raise AssertionError(f'{label}: correction row {work_name!r} has invalid УменьшДен={amount_delta!r}')

        quantity_delta = parse_decimal(change.findtext('УменьшКол'))
        quantity_unchanged = (change.findtext('НетИзмКол') or '').strip()
        if (quantity_delta is None or quantity_delta <= 0) and not quantity_unchanged:
            raise AssertionError(f'{label}: correction row {work_name!r} is missing УменьшКол/НетИзмКол')

    return len(correction_rows), len(new_circumstances_rows)


def main():
    data = load_json(INPUT_JSON)
    exports = build_xml_exports_by_ks2_sheet(data)
    if not exports:
        raise SystemExit('No per-sheet XML exports were generated')

    total_corrections = 0
    total_new_circumstances = 0

    for item in exports:
        label = item['filename']
        xml_bytes = render_xml_bytes(item['tree'])
        xml_doc = ensure_valid_against_xsd(xml_bytes, label)
        ensure_non_negative_section_totals(xml_doc, label)
        correction_count, new_circumstances_count = ensure_correction_rows_are_mapped(xml_doc, label)
        total_corrections += correction_count
        total_new_circumstances += new_circumstances_count
        print(f'{label}: VALID, correction_rows={correction_count}, new_circumstances_rows={new_circumstances_count}')

    if total_corrections < 2:
        raise AssertionError(f'Expected at least 2 mapped correction rows in primer-zapolneniya, got {total_corrections}')
    if total_new_circumstances < 2:
        raise AssertionError(
            'Expected at least 2 new-circumstances correction rows in primer-zapolneniya, '
            f'got {total_new_circumstances}'
        )

    print(
        'OK: primer-zapolneniya correction regression passed '
        f'({len(exports)} XML, corrections={total_corrections}, new_circumstances={total_new_circumstances})'
    )


if __name__ == '__main__':
    main()
