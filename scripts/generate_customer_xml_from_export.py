#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from lxml import etree as ET

ROOT = Path(__file__).resolve().parents[1]
XSD_Z = ROOT / 'nalog docs' / 'ON_AKTREZRABZ.xsd'
DEFAULT_OUTPUT = ROOT / 'output' / 'small-sample-customer.xml'


def parse_args():
    parser = argparse.ArgumentParser(description='Generate customer XML (ON_AKTREZRABZ) from exported JSON model')
    parser.add_argument('input_json', help='Path to exported JSON from web form')
    parser.add_argument('--contractor-xml', help='Path to contractor XML (P file) to copy file id/date/time', required=False)
    parser.add_argument('-o', '--output', default=str(DEFAULT_OUTPUT), help='Output XML path')
    return parser.parse_args()


def fmt_date(value: str | None) -> str:
    if not value:
        return '01.01.2026'
    value = str(value).strip().replace(' г.', '').replace(' г', '')
    if len(value) == 10 and value[4] == '-' and value[7] == '-':
        yyyy, mm, dd = value.split('-')
        return f'{dd}.{mm}.{yyyy}'
    return value[:10]


def split_fio(text: str | None):
    parts = [p for p in (text or '').replace(',', ' ').split() if p]
    if not parts:
        return 'Иванов', 'Иван', None
    if len(parts) == 1:
        return parts[0], 'Иван', None
    if len(parts) == 2 and parts[0].endswith('.'):
        return parts[0].rstrip('.'), parts[1], None
    if len(parts) == 2:
        return parts[0], parts[1], None
    return parts[0], parts[1], ' '.join(parts[2:])


def load_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def build_customer_xml(data: dict, contractor_xml_path: Path | None = None) -> ET._ElementTree:
    common = data.get('common', {})
    xml = data.get('xml', {})
    generated = xml.get('generated', {})
    manual = xml.get('manual', {})
    constants = xml.get('constants', {})
    ks2_sheets = data.get('ks2Sheets', [])
    first_sheet = ks2_sheets[0] if ks2_sheets else {'document': {}}
    first_doc = first_sheet.get('document', {})

    contractor_file_id = generated.get('fileId') or 'ON_AKTREZRABP_UNKNOWN'
    contractor_file_date = fmt_date(generated.get('fileDate'))
    contractor_file_time = generated.get('fileTime') or '00:00:00'
    if contractor_xml_path and contractor_xml_path.exists():
        root_p = ET.parse(str(contractor_xml_path)).getroot()
        doc_p = root_p.find('Документ')
        contractor_file_id = root_p.get('ИдФайл') or contractor_file_id
        contractor_file_date = doc_p.get('ДатаИнфПодр') or contractor_file_date
        contractor_file_time = doc_p.get('ВремИнфПодр') or contractor_file_time

    root = ET.Element('Файл',
        ИдФайл=f'ON_AKTREZRABZ_{contractor_file_id[-30:]}',
        ВерсПрог='KC2-KC3-XML-webapp',
        ВерсФорм='1.00'
    )
    doc = ET.SubElement(root, 'Документ',
        КНД='1110335',
        ДатаИнфПодр=fmt_date(generated.get('fileDate')),
        ВремИнфПодр=generated.get('fileTime') or '00:00:00',
        НаимЭкСубСост=manual.get('economicSubjectName') or common.get('techCustomerName') or common.get('developerName') or 'Заказчик'
    )

    base = ET.SubElement(doc, 'ОснДоверОргСост')
    ident = ET.SubElement(base, 'ИдРекСост')
    ET.SubElement(ident, 'ИННЮЛ').text = manual.get('customerInn') or '7701234567'

    ET.SubElement(doc, 'ИдИнфПодр',
        ИдФайлИнфПодр=contractor_file_id,
        ДатаФайлИнфПодр=contractor_file_date,
        ВремяФайлИнфПодр=contractor_file_time,
        ЭП='placeholder-signature-base64'
    )

    content = ET.SubElement(doc, 'СодФХЖ4',
        НомПостДок=first_doc.get('number') or 'без номера',
        ДатаПостДок=fmt_date(first_doc.get('date')),
        ВидОпер=common.get('operationType') or 'Сдача-приемка результатов работ',
        ПрГосМун=constants.get('isGovMunicipal') or '0'
    )
    acceptance = ET.SubElement(content, 'СвПрием', КодСодОпер='1')
    ET.SubElement(acceptance, 'ДатаПрин').text = fmt_date(first_doc.get('date'))

    signer_block = ET.SubElement(doc, 'ПодписантЗак')
    signer_parent = ET.SubElement(signer_block, 'Подписант',
        СтатПодп=manual.get('signerStatus') or '1',
        ТипПодпис=manual.get('signatureType') or '1',
        Должн=common.get('customerSignerPosition') or common.get('techCustomerSignerPosition') or 'Уполномоченное лицо заказчика'
    )
    family, name, patronymic = split_fio(common.get('customerSignerName') or common.get('techCustomerSignerName') or 'Иванов Иван')
    fio = ET.SubElement(signer_parent, 'ФИО', Фамилия=family, Имя=name)
    if patronymic:
        fio.set('Отчество', patronymic)

    return ET.ElementTree(root)


def main():
    args = parse_args()
    data = load_json(Path(args.input_json))
    tree = build_customer_xml(data, Path(args.contractor_xml) if args.contractor_xml else None)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tree.write(str(output_path), encoding='windows-1251', xml_declaration=True, pretty_print=True)
    print(output_path)


if __name__ == '__main__':
    main()
