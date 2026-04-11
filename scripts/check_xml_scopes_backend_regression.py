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
SMALL_SAMPLE_JSON = ROOT / 'output' / 'small-sample-export.json'

sys.path.insert(0, str(ROOT / 'scripts'))
from generate_customer_xml_from_export import build_customer_xml_exports_by_ks2_sheet  # noqa: E402
from generate_xml_from_export import build_xml_exports_by_ks2_sheet, load_json  # noqa: E402

CUSTOMER_KEYS = {
    'customerEconomicSubjectName',
    'customerAuthorityDocName',
    'customerAuthorityDocNumber',
    'customerAuthorityDocDate',
    'customerAuthorityDocId',
    'customerAuthorityDocInfo',
    'customerSignerAuthorityDocName',
    'customerSignerAuthorityDocNumber',
    'customerSignerAuthorityDocDate',
    'customerSignerAuthorityDocId',
    'customerSignerAuthorityDocInfo',
    'customerSignerStatus',
    'customerSignatureType',
    'customerSignatureStorageId',
    'customerAcceptanceCode',
    'customerAcceptanceText',
    'customerAcceptanceDate',
    'customerAcceptanceRefusalInfo',
    'customerAcceptanceRefusalDate',
    'customerAcceptanceRefusalDocName',
    'customerAcceptanceRefusalDocNumber',
    'customerAcceptanceRefusalDocDate',
    'customerAcceptanceRefusalDocId',
    'customerAcceptanceDefectInfo',
    'customerAcceptanceDefectDocName',
    'customerAcceptanceDefectDocNumber',
    'customerAcceptanceDefectDocDate',
    'customerAcceptanceDefectDocId',
    'customerAcceptanceNdflAmount',
    'customerReductionBaseAmount',
    'customerReductionTaxAmount',
    'customerReductionToBePaidAmount',
    'customerReductionToBePaidFromStartAmount',
    'customerReductionTotalAmount',
    'customerSettlementNotice',
    'customerSettlementDisagreementReason',
    'customerSettlementExtraDocName',
    'customerSettlementExtraDocNumber',
    'customerSettlementExtraDocDate',
    'customerSettlementExtraDocId',
    'customerSettlementIgnoredDocName',
    'customerSettlementIgnoredDocNumber',
    'customerSettlementIgnoredDocDate',
    'customerSettlementIgnoredDocId',
    'customerSignerPowerId',
    'customerSignerPowerNumber',
    'customerSignerPowerDate',
    'customerSignerPowerInternalNumber',
    'customerSignerPowerRegistrationDate',
    'customerSignerPowerSystemMark',
    'customerSignerPaperPowerDate',
    'customerSignerPaperPowerInternalNumber',
    'customerSignerPaperPowerIdentity',
    'customerSignerPaperPowerFio',
}


def render_xml_bytes(tree: ET._ElementTree) -> bytes:
    return ET.tostring(tree, encoding='windows-1251', xml_declaration=True, pretty_print=True)


def ensure_valid_against_xsd(xml_bytes: bytes, xsd_path: Path, label: str) -> ET._Element:
    schema = ET.XMLSchema(ET.parse(str(xsd_path)))
    xml_doc = ET.fromstring(xml_bytes)
    if not schema.validate(xml_doc):
        errors = '\n'.join(f'line {err.line}: {err.message}' for err in schema.error_log)
        raise AssertionError(f'{label}: INVALID against XSD\n{errors}')
    return xml_doc


def build_scoped_payload() -> dict:
    data = load_json(SMALL_SAMPLE_JSON)
    legacy_xml = copy.deepcopy(data.get('xml') or {})
    legacy_manual = copy.deepcopy(legacy_xml.get('manual') or {})

    data['xmlP'] = {
        'generated': copy.deepcopy(legacy_xml.get('generated') or {}),
        'constants': copy.deepcopy(legacy_xml.get('constants') or {}),
        'manual': {key: value for key, value in legacy_manual.items() if key not in CUSTOMER_KEYS},
        'traceableGoods': copy.deepcopy(legacy_xml.get('traceableGoods') or []),
    }
    data['xmlZ'] = {
        'manual': {key: value for key, value in legacy_manual.items() if key in CUSTOMER_KEYS},
    }

    data['xml'] = {
        'generated': {},
        'constants': {},
        'manual': {},
        'traceableGoods': copy.deepcopy(legacy_xml.get('traceableGoods') or []),
        'settlement': copy.deepcopy(legacy_xml.get('settlement') or {}),
    }
    return data


def main():
    data = build_scoped_payload()

    contractor_exports = build_xml_exports_by_ks2_sheet(copy.deepcopy(data))
    customer_exports = build_customer_xml_exports_by_ks2_sheet(copy.deepcopy(data))
    if len(contractor_exports) != 1 or len(customer_exports) != 1:
        raise AssertionError('Expected single-sheet P and Z exports from scoped payload')

    contractor_xml = ensure_valid_against_xsd(render_xml_bytes(contractor_exports[0]['tree']), P_XSD_PATH, contractor_exports[0]['filename'])
    customer_xml = ensure_valid_against_xsd(render_xml_bytes(customer_exports[0]['tree']), Z_XSD_PATH, customer_exports[0]['filename'])

    contractor_id = contractor_xml.get('ИдФайл')
    linked_node = customer_xml.find('./Документ/ИдИнфПодр')
    linked_id = linked_node.get('ИдФайлИнфПодр') if linked_node is not None else None
    if contractor_id != linked_id:
        raise AssertionError(f'Scoped xmlP/xmlZ payload must preserve Z->P link: {contractor_id!r} != {linked_id!r}')

    print(f"OK: scoped xmlP/xmlZ payload builds valid {contractor_exports[0]['filename']} + {customer_exports[0]['filename']}")


if __name__ == '__main__':
    main()
