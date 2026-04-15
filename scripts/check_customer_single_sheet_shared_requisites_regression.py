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


def render_xml_bytes(tree: ET._ElementTree) -> bytes:
    return ET.tostring(tree, encoding='windows-1251', xml_declaration=True, pretty_print=True)


def ensure_valid_against_xsd(xml_bytes: bytes, xsd_path: Path, label: str) -> ET._Element:
    schema = ET.XMLSchema(ET.parse(str(xsd_path)))
    xml_doc = ET.fromstring(xml_bytes)
    if not schema.validate(xml_doc):
        errors = '\n'.join(f'line {err.line}: {err.message}' for err in schema.error_log)
        raise AssertionError(f'{label}: INVALID against XSD\n{errors}')
    return xml_doc


def fio_to_text(node: ET._Element | None) -> str:
    if node is None:
        return ''
    parts = [
        str(node.get('Фамилия') or '').strip(),
        str(node.get('Имя') or '').strip(),
        str(node.get('Отчество') or '').strip(),
    ]
    return ' '.join(part for part in parts if part)


def fmt_date(value: str | None) -> str:
    if not value:
        return '01.01.2026'
    text = str(value).strip()
    if len(text) == 10 and text[4] == '-' and text[7] == '-':
        yyyy, mm, dd = text.split('-')
        return f'{dd}.{mm}.{yyyy}'
    return text[:10]


LEGACY_SIGNER_NAMES = {
    'Легаси Девелопер Легасиевич',
    'Легаси Техзаказчик Легасиевич',
}
CURRENT_SIGNER_NAMES = {
    'Петров Петр Петрович',
    'Сидоров Сидор Сидорович',
}


def build_conflicting_payload() -> dict:
    data = load_json(SMALL_SAMPLE_JSON)
    data.setdefault('documentContext', {})
    data.setdefault('common', {})
    data.setdefault('ks3', {})
    data['ks3'].setdefault('document', {})
    data.setdefault('xmlZ', {}).setdefault('manual', {})

    data['documentContext'].update({
        'developerName': 'Текущий застройщик',
        'techCustomerName': 'Текущий техзаказчик',
        'customerSignerName': 'Петров Петр Петрович',
        'customerSignerPosition': 'Главный представитель заказчика',
        'techCustomerSignerName': 'Сидоров Сидор Сидорович',
        'techCustomerSignerPosition': 'Главный представитель техзаказчика',
        'operationType': 'Приемка работ по текущему акту КС-2',
        'ks2DocLabel': 'АКТ',
        'ks2DocSubtitle': 'ПО ТЕКУЩЕМУ SINGLE-SHEET ШАБЛОНУ',
    })
    data['common'].update({
        'ks3DeveloperName': 'Легаси Девелопер Легасиевич',
        'ks3DeveloperPosition': 'Легаси должность застройщика',
        'ks3TechCustomerName': 'Легаси Техзаказчик Легасиевич',
        'ks3TechCustomerPosition': 'Легаси должность техзаказчика',
        'ks3DeveloperOrgName': 'Легаси орг застройщика',
        'ks3TechCustomerOrgName': 'Легаси орг техзаказчика',
        'ks3DocLabel': 'СПРАВКА',
        'ks3DocSubtitle': 'ЛЕГАСИ КС-3',
    })
    data['ks3']['document'].update({
        'number': 'LEGACY-KS3-999',
        'date': '2026-01-01',
    })
    data['xmlZ']['manual'].pop('customerEconomicSubjectName', None)
    return data


def expect_shared_requisites_win_over_legacy_ks3():
    data = build_conflicting_payload()
    expected_doc = (data.get('ks2Sheets') or [{}])[0].get('document') or {}

    tree = build_customer_xml(copy.deepcopy(data))
    root = ensure_valid_against_xsd(render_xml_bytes(tree), Z_XSD_PATH, 'shared-requisites')
    doc = root.find('./Документ')
    if doc is None:
        raise AssertionError('Customer XML must contain Документ')

    subject_name = doc.get('НаимЭконСубСост')
    if subject_name != 'Текущий техзаказчик':
        raise AssertionError(f'Expected current shared tech customer name, got {subject_name!r}')

    content = doc.find('./СодФХЖ4')
    if content is None:
        raise AssertionError('Customer XML must contain СодФХЖ4')
    if content.get('НомПостДок') != str(expected_doc.get('number') or ''):
        raise AssertionError(
            'Customer XML must prefer current KS-2 document number over legacy KS-3 number: '
            f"{content.get('НомПостДок')!r} != {expected_doc.get('number')!r}"
        )
    expected_posting_date = fmt_date(expected_doc.get('date'))
    if content.get('ДатаПостДок') != expected_posting_date:
        raise AssertionError(
            'Customer XML must prefer current KS-2 document date over legacy KS-3 date: '
            f"{content.get('ДатаПостДок')!r} != {expected_posting_date!r}"
        )
    if content.get('ВидОпер') != 'Приемка работ по текущему акту КС-2':
        raise AssertionError(f"Customer XML must prefer explicit shared operation type, got {content.get('ВидОпер')!r}")

    signer_names = {
        fio_to_text(node)
        for node in root.findall('./Документ/ПодписантЗак/Подписант/ФИО')
    }
    if signer_names != CURRENT_SIGNER_NAMES:
        raise AssertionError(f'Customer XML must keep only current shared signers, got {sorted(signer_names)!r}')
    if signer_names & LEGACY_SIGNER_NAMES:
        raise AssertionError(f'Legacy KS-3 signers leaked into active customer XML: {sorted(signer_names & LEGACY_SIGNER_NAMES)!r}')

    print('shared-requisites: current document/signers beat legacy KS-3 fields')


def expect_ks2_label_used_when_operation_type_empty():
    data = build_conflicting_payload()
    data['documentContext']['operationType'] = ''

    tree = build_customer_xml(copy.deepcopy(data))
    root = ensure_valid_against_xsd(render_xml_bytes(tree), Z_XSD_PATH, 'ks2-label-fallback')
    content = root.find('./Документ/СодФХЖ4')
    actual = content.get('ВидОпер') if content is not None else None
    expected = 'АКТ ПО ТЕКУЩЕМУ SINGLE-SHEET ШАБЛОНУ'
    if actual != expected:
        raise AssertionError(f'Customer XML must prefer KS-2 label/subtitle over legacy KS-3 title, got {actual!r}')

    print('operation-kind: KS-2 label/subtitle beat legacy KS-3 title')


def main():
    expect_shared_requisites_win_over_legacy_ks3()
    expect_ks2_label_used_when_operation_type_empty()
    print('OK: customer single-sheet shared requisites regression passed')


if __name__ == '__main__':
    main()
