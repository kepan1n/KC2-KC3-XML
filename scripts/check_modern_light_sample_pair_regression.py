#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

from lxml import etree as ET

ROOT = Path(__file__).resolve().parents[1]
P_XSD_PATH = ROOT / 'nalog docs' / 'ON_AKTREZRABP_1_971_01_01_00_03.xsd'
Z_XSD_PATH = ROOT / 'nalog docs' / 'ON_AKTREZRABZ.xsd'
SAMPLE_PATH = ROOT / 'variants' / 'modern-light' / 'data' / 'sample-data.json'

sys.path.insert(0, str(ROOT / 'scripts'))
from generate_customer_xml_from_export import build_customer_xml_exports_by_ks2_sheet  # noqa: E402
from generate_xml_from_export import (  # noqa: E402
    build_holdback_sections_from_rows,
    build_sheet_settlement_from_holdback_sections,
    build_xml_exports_by_ks2_sheet,
    split_vat_inclusive_amount,
)
from z_xsd_compat import normalize_document_for_xsd  # noqa: E402


def serialize_xml_tree(tree: ET._ElementTree) -> bytes:
    return ET.tostring(tree, encoding='windows-1251', xml_declaration=True, pretty_print=True)


def validate_exports(exports, schema_path: Path, label: str):
    schema = ET.XMLSchema(ET.parse(str(schema_path)))
    if not exports:
        raise AssertionError(f'Expected at least one {label} export, got none')
    for item in exports:
        xml_bytes = serialize_xml_tree(item['tree'])
        document = ET.fromstring(xml_bytes)
        document = normalize_document_for_xsd(document, schema_path)
        if not schema.validate(document):
            last_error = schema.error_log.last_error
            raise AssertionError(
                f"{label} sample regression failed for {item['filename']}: {last_error.message if last_error else 'XSD validation error'}"
            )


def find_info_pair_values(root: ET._Element, key: str):
    values = []
    for block in root.findall('./Документ/СвОРасч/ИнфПолСвОРасч'):
        for item in block.findall('ТекстИнф'):
            if item.get('Идентиф') == key:
                values.append(item.get('Значение'))
    return values


def assert_single_sheet_business_totals(payload: dict, export_item: dict):
    sheet = payload['ks2Sheets'][0]
    vat_rate = float(sheet.get('vatRate') or 20)
    gross_total = round(sum(float(row.get('amount') or 0) for row in sheet.get('rows', []) if row.get('type') == 'item'), 2)
    totals = split_vat_inclusive_amount(gross_total, vat_rate)
    holdback_sections = build_holdback_sections_from_rows(payload.get('holdbacks', {}).get('rows', []))
    settlement = build_sheet_settlement_from_holdback_sections(holdback_sections)

    xml_bytes = serialize_xml_tree(export_item['tree'])
    root = ET.fromstring(xml_bytes)
    total = root.find('./Документ/ВсегоАктОтч')
    settlement_el = root.find('./Документ/СвОРасч')
    settlement_item = root.find('./Документ/СвОРасч/УчетТребУдерж')

    if total is None or settlement_el is None or settlement_item is None:
        raise AssertionError('Expected total and settlement blocks in contractor sample export')

    actual_total = {
        'base': total.get('СтТовБезНДСВсего'),
        'gross': total.get('СтТовУчНалВсего'),
        'vat': total.findtext('СумНалВсего'),
    }
    expected_total = {
        'base': f"{totals['base']:.2f}",
        'gross': f"{totals['gross']:.2f}",
        'vat': f"{totals['vat']:.2f}",
    }
    if actual_total != expected_total:
        raise AssertionError(f'Unexpected contractor totals: expected {expected_total}, got {actual_total}')

    actual_settlement = {
        'totalRetention': settlement_el.get('СумУдержВсегоОтч'),
        'totalClaims': settlement_el.get('СумТребВсегоОтч'),
        'payable': settlement_el.get('ВсегоКОплатОтч'),
        'aggregated': settlement_item.get('СумТребУдерж'),
    }
    expected_settlement = {
        'totalRetention': f"{float(settlement['totalRetention']):.2f}",
        'totalClaims': f"{float(settlement['totalClaims']):.2f}",
        'payable': f"{float(settlement['totalPayable']):.2f}",
        'aggregated': f"{float(sum(float(row.get('amount') or 0) for row in settlement['settlementRows'])):.2f}",
    }
    if actual_settlement != expected_settlement:
        raise AssertionError(f'Unexpected contractor settlement: expected {expected_settlement}, got {actual_settlement}')

    guarantee_total_values = find_info_pair_values(root, 'RET_GUARANTEE_TOTAL_RUB')
    advance_close_values = find_info_pair_values(root, 'AVANS_TOTAL_CLOSING_RUB')
    if expected_settlement['totalRetention'] not in guarantee_total_values and f"{float(settlement['totalGuaranteeRetention']):.2f}" not in guarantee_total_values:
        raise AssertionError(f'Missing guarantee retention info block value: {guarantee_total_values}')
    if f"{float(settlement['totalAdvanceClose']):.2f}" not in advance_close_values:
        raise AssertionError(f'Missing advance closing info block value: {advance_close_values}')


def assert_holdbacks_toggle_affects_payable(payload: dict):
    gross_total = round(sum(float(row.get('amount') or 0) for row in payload['ks2Sheets'][0].get('rows', []) if row.get('type') == 'item'), 2)
    disabled_payload = copy.deepcopy(payload)
    disabled_payload.setdefault('holdbacks', {})['includeInXml'] = False

    disabled_exports = build_xml_exports_by_ks2_sheet(disabled_payload)
    if len(disabled_exports) != 1:
        raise AssertionError(f'Expected exactly 1 contractor export for disabled-holdbacks sample, got {len(disabled_exports)}')

    xml_bytes = serialize_xml_tree(disabled_exports[0]['tree'])
    root = ET.fromstring(xml_bytes)
    settlement_el = root.find('./Документ/СвОРасч')
    if settlement_el is None:
        raise AssertionError('Expected СвОРасч in disabled-holdbacks contractor export')

    actual = {
        'totalRetention': settlement_el.get('СумУдержВсегоОтч'),
        'totalClaims': settlement_el.get('СумТребВсегоОтч'),
        'payable': settlement_el.get('ВсегоКОплатОтч'),
    }
    expected = {
        'totalRetention': '0.00',
        'totalClaims': '0.00',
        'payable': f'{gross_total:.2f}',
    }
    if actual != expected:
        raise AssertionError(f'Unexpected settlement totals for disabled holdbacks: expected {expected}, got {actual}')


def assert_customer_time_format(payload: dict):
    customer_exports = build_customer_xml_exports_by_ks2_sheet(payload)
    if len(customer_exports) != 1:
        raise AssertionError(f'Expected exactly 1 customer export for time-format check, got {len(customer_exports)}')

    xml_bytes = serialize_xml_tree(customer_exports[0]['tree'])
    root = ET.fromstring(xml_bytes)
    doc = root.find('./Документ')
    info = root.find('./Документ/ИдИнфПодр')
    if doc is None or info is None:
        raise AssertionError('Expected Документ and ИдИнфПодр in customer export')

    for label, value in {
        'ВрИнфЗак': doc.get('ВрИнфЗак'),
        'ВремяФайлИнфПодр': info.get('ВремяФайлИнфПодр'),
    }.items():
        if not value or ':' not in value or '.' in value:
            raise AssertionError(f'{label} must use time format ЧЧ:ММ:СС, got {value!r}')


def assert_docx_optional_p_fields_supported(payload: dict):
    custom_payload = copy.deepcopy(payload)
    xml_p = custom_payload.setdefault('xmlP', {})
    manual = xml_p.setdefault('manual', {})
    manual.update({
        'agreedInfoStructureId': '1234.5678.0000',
        'hasEstimateChange': '0',
        'deliveryNoticeDate': '2025-11-03',
        'deliveryNoticeDocName': 'Письмо о предъявлении результата работ',
        'deliveryNoticeDocNumber': 'ПР-11',
        'deliveryNoticeDocDate': '2025-11-03',
        'acceptanceDeadlineWorkDays': '7',
        'readinessNoticeDocName': 'Уведомление о готовности к сдаче',
        'readinessNoticeDocNumber': 'ГС-22',
        'readinessNoticeDocDate': '2025-11-01',
    })

    exports = build_xml_exports_by_ks2_sheet(custom_payload)
    if len(exports) != 1:
        raise AssertionError(f'Expected exactly 1 contractor export for docx optional-fields check, got {len(exports)}')

    xml_bytes = serialize_xml_tree(exports[0]['tree'])
    root = ET.fromstring(xml_bytes)
    doc = root.find('./Документ')
    act = root.find('./Документ/СвАктСдПр')
    transfer = root.find('./Документ/СвПродПер/СвПер')
    if doc is None or act is None or transfer is None:
        raise AssertionError('Expected Документ, СвАктСдПр and СвПродПер/СвПер in contractor export')

    if doc.get('СоглСтрДопИнф') != '1234.5678.0000':
        raise AssertionError(f"Expected Документ/@СоглСтрДопИнф, got {doc.get('СоглСтрДопИнф')!r}")

    if act.find('ИзмСмет') is not None:
        raise AssertionError('Expected ИзмСмет to be omitted when hasEstimateChange=0')
    estimate_no_change = act.find('ИзмСметНет')
    if estimate_no_change is None or (estimate_no_change.text or '').strip() != 'смета не менялась':
        raise AssertionError('Expected ИзмСметНет="смета не менялась" when hasEstimateChange=0')

    if transfer.get('ДатПредъявЗак') != '03.11.2025':
        raise AssertionError(f"Expected СвПер/@ДатПредъявЗак='03.11.2025', got {transfer.get('ДатПредъявЗак')!r}")

    delivery_doc = transfer.find('./ИдДокПредъявЗак/ТипИдДок')
    if delivery_doc is None:
        raise AssertionError('Expected ИдДокПредъявЗак/ТипИдДок in СвПер')
    if delivery_doc.get('НаимДок') != 'Письмо о предъявлении результата работ' or delivery_doc.get('НомерДок') != 'ПР-11' or delivery_doc.get('ДатаДок') != '03.11.2025':
        raise AssertionError(f'Unexpected delivery notice doc attrs: {delivery_doc.attrib}')

    if transfer.findtext('СрокПринРабДн') != '7':
        raise AssertionError(f"Expected СвПер/СрокПринРабДн='7', got {transfer.findtext('СрокПринРабДн')!r}")

    readiness_doc = transfer.find('./ИдСообОГотовн/ТипИдДок')
    if readiness_doc is None:
        raise AssertionError('Expected ИдСообОГотовн/ТипИдДок in СвПер')
    if readiness_doc.get('НаимДок') != 'Уведомление о готовности к сдаче' or readiness_doc.get('НомерДок') != 'ГС-22' or readiness_doc.get('ДатаДок') != '01.11.2025':
        raise AssertionError(f'Unexpected readiness notice doc attrs: {readiness_doc.attrib}')


def main():
    payload = json.loads(SAMPLE_PATH.read_text(encoding='utf-8'))
    ks2_sheets = payload.get('ks2Sheets') or []
    if len(ks2_sheets) != 1:
        raise AssertionError(f'Expected exactly 1 active ks2 sheet in sample-data.json, got {len(ks2_sheets)}')

    contractor_exports = build_xml_exports_by_ks2_sheet(payload)
    customer_exports = build_customer_xml_exports_by_ks2_sheet(payload)

    if len(contractor_exports) != 1:
        raise AssertionError(f'Expected exactly 1 contractor P export, got {len(contractor_exports)}')
    if len(customer_exports) != 1:
        raise AssertionError(f'Expected exactly 1 customer Z export, got {len(customer_exports)}')

    validate_exports(contractor_exports, P_XSD_PATH, 'contractor P')
    validate_exports(customer_exports, Z_XSD_PATH, 'customer Z')
    assert_single_sheet_business_totals(payload, contractor_exports[0])
    assert_holdbacks_toggle_affects_payable(payload)
    assert_customer_time_format(payload)
    assert_docx_optional_p_fields_supported(payload)

    print('OK: modern-light sample pair regression passed (single-sheet P + Z)')


if __name__ == '__main__':
    main()
