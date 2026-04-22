#!/usr/bin/env python3
from __future__ import annotations

import copy
import sys
from pathlib import Path

from lxml import etree as ET

ROOT = Path(__file__).resolve().parents[1]
Z_XSD_PATH = ROOT / 'nalog docs' / 'ON_AKTREZRABZ.xsd'
SMALL_SAMPLE_JSON = ROOT / 'output' / 'small-sample-export.json'

sys.path.insert(0, str(ROOT / 'scripts'))
from generate_customer_xml_from_export import build_customer_xml  # noqa: E402
from generate_xml_from_export import load_json  # noqa: E402
from z_xsd_compat import normalize_document_for_xsd  # noqa: E402


def render_xml_bytes(tree: ET._ElementTree) -> bytes:
    return ET.tostring(tree, encoding='windows-1251', xml_declaration=True, pretty_print=True)


def require_doc_and_info(root: ET._Element):
    doc = root.find('./Документ')
    info = root.find('./Документ/ИдИнфПодр')
    if doc is None or info is None:
        raise AssertionError('Expected Документ and ИдИнфПодр in customer XML')
    return doc, info


def assert_docx_time_format(root: ET._Element):
    doc, info = require_doc_and_info(root)
    values = {
        'ВрИнфЗак': doc.get('ВрИнфЗак'),
        'ВремяФайлИнфПодр': info.get('ВремяФайлИнфПодр'),
    }
    for label, value in values.items():
        if not value or ':' not in value or '.' in value:
            raise AssertionError(f'{label} must stay in DOCX format ЧЧ:ММ:СС before XSD normalization, got {value!r}')


def assert_legacy_time_format(root: ET._Element):
    doc, info = require_doc_and_info(root)
    values = {
        'ВрИнфЗак': doc.get('ВрИнфЗак'),
        'ВремяФайлИнфПодр': info.get('ВремяФайлИнфПодр'),
    }
    for label, value in values.items():
        if not value or '.' not in value or ':' in value:
            raise AssertionError(f'{label} must switch to legacy XSD format ЧЧ.ММ.СС only in normalized copy, got {value!r}')


def main():
    payload = load_json(SMALL_SAMPLE_JSON)
    root = ET.fromstring(render_xml_bytes(build_customer_xml(copy.deepcopy(payload))))
    assert_docx_time_format(root)

    schema = ET.XMLSchema(ET.parse(str(Z_XSD_PATH)))
    if schema.validate(root):
        raise AssertionError('Raw production customer XML unexpectedly validates against legacy Z XSD without time normalization')

    normalized_root = normalize_document_for_xsd(copy.deepcopy(root), Z_XSD_PATH)
    assert_docx_time_format(root)
    assert_legacy_time_format(normalized_root)

    if not schema.validate(normalized_root):
        errors = '\n'.join(f'line {err.line}: {err.message}' for err in schema.error_log)
        raise AssertionError(f'Normalized customer XML must validate against legacy Z XSD\n{errors}')

    print('OK: customer Z time compatibility regression passed (DOCX raw + legacy XSD normalization)')


if __name__ == '__main__':
    main()
