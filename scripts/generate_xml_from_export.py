#!/usr/bin/env python3
from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
from lxml import etree as ET

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_XML = ROOT / 'nalog docs' / 'пример xml 1110335.xml'
DEFAULT_OUTPUT = ROOT / 'output' / 'generated_1110335.xml'


def parse_args():
    parser = argparse.ArgumentParser(description='Generate XML 1110335 from exported KC2-KC3 JSON model')
    parser.add_argument('input_json', help='Path to exported JSON from web form')
    parser.add_argument('-o', '--output', default=str(DEFAULT_OUTPUT), help='Output XML path')
    return parser.parse_args()


def fmt_money(value) -> str:
    try:
        number = float(value or 0)
    except Exception:
        number = 0.0
    return f'{number:.2f}'


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
    if len(parts) == 2:
        return parts[0], parts[1], None
    return parts[0], parts[1], ' '.join(parts[2:])


def load_json(path: Path):
    with path.open('r', encoding='utf-8') as fh:
        return json.load(fh)


def clear_children(el):
    for child in list(el):
        el.remove(child)


def set_attr(el, **attrs):
    for key, value in attrs.items():
        if value is None:
            continue
        el.set(key, str(value))


def build_xml(data: dict) -> ET._ElementTree:
    parser = ET.XMLParser(remove_blank_text=False)
    tree = ET.parse(str(TEMPLATE_XML), parser)
    root = tree.getroot()
    doc = root.find('Документ')
    common = data.get('common', {})
    xml = data.get('xml', {})
    generated = xml.get('generated', {})
    manual = xml.get('manual', {})
    constants = xml.get('constants', {})
    settlement = xml.get('settlement', {})
    holdbacks = data.get('holdbacks', {})
    sections = holdbacks.get('sections', [])
    ks2_sheets = data.get('ks2Sheets', [])
    first_sheet = ks2_sheets[0] if ks2_sheets else {}
    first_doc = first_sheet.get('document', {})
    ks3 = data.get('ks3', {})
    ks3_doc = ks3.get('document', {})
    ks3_totals = ks3.get('totals', {})

    file_id = generated.get('fileId') or root.get('ИдФайл')
    set_attr(root,
             ИдФайл=file_id,
             ВерсПрог=generated.get('programVersion') or root.get('ВерсПрог') or 'KC2-KC3-XML-webapp',
             ВерсФорм=generated.get('formatVersion') or root.get('ВерсФорм') or '1.00')

    set_attr(doc,
             КНД=generated.get('knd') or '1110335',
             ДатаИнфПодр=fmt_date(generated.get('fileDate')),
             ВремИнфПодр=generated.get('fileTime') or doc.get('ВремИнфПодр') or '00:00:00',
             НаимЭкСубСост=manual.get('economicSubjectName') or common.get('contractorName') or doc.get('НаимЭкСубСост'))

    org = doc.find('ОснДовОргСост/ИдРекСост/ИННЮЛ')
    if org is not None:
        org.text = manual.get('contractorInn') or (org.text or '7701234567')

    act = doc.find('СвАктСдПр')
    set_attr(act,
             НомерДок=first_doc.get('number') or 'без номера',
             ДатаДок=fmt_date(first_doc.get('date') or ks3_doc.get('documentDate')),
             НаимОб=common.get('objectName') or common.get('constructionObject') or act.get('НаимОб'),
             КодОКВДог='643')

    contract_id = act.find('ИдДог/ТипИдДок')
    set_attr(contract_id,
             НаимДок='Договор генподряда',
             НомерДок=common.get('contractNumber') or 'без номера',
             ДатаДок=fmt_date(common.get('contractDate')))

    correction = act.find('ИспрАктСдПр')
    set_attr(correction,
             НомИспр=manual.get('correctionNumber') or correction.get('НомИспр') or '1',
             ДатаИспр=fmt_date(manual.get('correctionDate') or first_doc.get('date') or ks3_doc.get('documentDate')))

    contractor = act.find('СвПодр/СвСторДог/ИдСв/СвЮЛУч')
    set_attr(contractor,
             НаимОрг=common.get('contractorName') or contractor.get('НаимОрг'),
             ИННЮЛ=manual.get('contractorInn') or contractor.get('ИННЮЛ'))

    customer = act.find('СвЗак/СвСторДог/ИдСв/СвЮЛУч')
    set_attr(customer,
             НаимОрг=common.get('developerName') or common.get('techCustomerName') or customer.get('НаимОрг'),
             ИННЮЛ=manual.get('customerInn') or customer.get('ИННЮЛ'))

    basic = act.find('ОсновСтроит')
    set_attr(basic, ПрГосМун=constants.get('isGovMunicipal') or '0')

    address = act.find('МестВыпРаб/АдрРФ')
    set_attr(address,
             Индекс=manual.get('developerPostalIndex') or address.get('Индекс') or '123456',
             КодРегион=manual.get('developerRegionCode') or address.get('КодРегион') or '77')

    estimate = act.find('ИзмСмет')
    set_attr(estimate, КодСмет=manual.get('estimateVersionCode') or estimate.get('КодСмет') or '1')
    supplement = act.find('ИзмСмет/ИдДопСогл/ТипИдДок')
    set_attr(supplement,
             НаимДок=manual.get('supplementDocType') or supplement.get('НаимДок') or 'Дополнительное соглашение',
             НомерДок=manual.get('supplementDocNumber') or supplement.get('НомерДок') or 'ДС-1',
             ДатаДок=fmt_date(manual.get('supplementDocDate') or supplement.get('ДатаДок')))

    currency = act.find('ДенИзм')
    set_attr(currency, КодОКВ='643')

    info_block = act.find('ИнфПолФХЖ1')
    clear_children(info_block)
    ET.SubElement(info_block, 'ТекстИнф', Идентиф='customField', Значение='generated')

    works = doc.find('НаимИСт')
    clear_children(works)

    traceable_goods = xml.get('traceableGoods', [])
    row_no = 1
    for sheet in ks2_sheets:
        rows = sheet.get('items', [])
        for item in rows:
            amount = float(item.get('amount') or 0)
            attrs = {
                'НаимТов': item.get('name') or f'Работа {row_no}',
                'ЦенаТов': fmt_money(item.get('price')),
                'СтТовБезНДС': fmt_money(amount),
                'НомСтр': str(row_no),
                'НомПоз': item.get('lineNo') or str(row_no),
                'ТипЗатр': '1',
                'ОКЕИ_Стройка': '796',
                'НаимЕдИзм': item.get('unit') or 'шт',
            }
            work_el = ET.SubElement(works, 'ВидРаб', **attrs)
            changes = ET.SubElement(work_el, 'УчОшИНовОбстСт')
            err = ET.SubElement(changes, 'ОшибПрПер')
            ET.SubElement(err, 'УвелДен').text = '1'
            ET.SubElement(err, 'УвелКол').text = '1'
            tax = ET.SubElement(work_el, 'СумНал')
            vat_rate = float(sheet.get('document', {}).get('vatRate') or 20)
            vat_amount = max(round(amount * vat_rate / 100, 2), 0)
            ET.SubElement(tax, 'СумНал').text = fmt_money(vat_amount)
            if row_no == 1 and traceable_goods:
                tg = traceable_goods[0]
                ET.SubElement(
                    work_el,
                    'СвПрослежСтройка',
                    НомТовПрослеж=tg.get('registrationNumber') or '123456789012345678901234567',
                    ЕдИзмПрослеж=tg.get('unitCode') or '796',
                    НаимЕдИзмПрослеж=tg.get('unitName') or 'шт',
                    КолВЕдПрослеж=fmt_money(tg.get('quantity') or 1).rstrip('0').rstrip('.') or '1',
                )
            row_no += 1

    for idx, section in enumerate(sections, start=1):
        sec = ET.SubElement(works, 'Раздел',
                            НаимРаздел=section.get('name') or f'Раздел №{idx}',
                            СтБезНДСРаздОтч=fmt_money(section.get('ks2Amount')))
        subitems = section.get('subitems', [])
        if subitems:
            for sub in subitems:
                ET.SubElement(sec, 'СвВидРаб',
                              НаимТов=sub.get('advanceDoc') or f'Подпункт {idx}',
                              ЦенаТов=fmt_money(sub.get('advanceReceived')),
                              СтТовБезНДС=fmt_money(sub.get('closingAmount')))
        else:
            ET.SubElement(sec, 'СвВидРаб',
                          НаимТов=section.get('name') or f'Раздел №{idx}',
                          ЦенаТов=fmt_money(section.get('ks2Amount')),
                          СтТовБезНДС=fmt_money(section.get('ks2Amount')))

    transfer = doc.find('СвПродПер')
    clear_children(transfer)
    ET.SubElement(transfer, 'СвПер', СодОпер='О ПРИЕМКЕ ВЫПОЛНЕННЫХ РАБОТ')

    settlement_el = doc.find('СвОРасч')
    clear_children(settlement_el)
    set_attr(settlement_el,
             СумУдержВсегоОтч=fmt_money(settlement.get('totalRetention')),
             СумТребВсегоОтч=fmt_money(settlement.get('totalClaims')),
             ВсегоКОплатОтч=fmt_money(holdbacks.get('totals', {}).get('payableAmount') or ks3_totals.get('forPeriod')))
    settlement_rows = settlement.get('settlementRows', []) or [{'amount': 1, 'kindCode': '31'}]
    for row in settlement_rows:
        amount = max(float(row.get('amount') or 0), 0)
        item = ET.SubElement(settlement_el, 'УчетТребУдерж', СумТребУдерж=fmt_money(amount if amount > 0 else 1))
        if row.get('kindCode', '').startswith('3'):
            child = ET.SubElement(item, 'ВидУдерж')
            child.text = str(row.get('kindCode'))
        else:
            child = ET.SubElement(item, 'ВидТреб')
            child.text = str(row.get('kindCode'))

    total_el = doc.find('ВсегоАктОтч')
    clear_children(total_el)
    total_base = float(ks3_totals.get('forPeriod') or 0)
    vat_total = float(ks3_totals.get('vat') or 0)
    set_attr(total_el, СтТовБезНДСВсего=fmt_money(total_base))
    ET.SubElement(total_el, 'СумНалВсего').text = fmt_money(vat_total)
    by_rate = ET.SubElement(total_el, 'СумПоСтавке', НалСт='20%', НалБаза=fmt_money(total_base))
    ET.SubElement(by_rate, 'СумНДС').text = fmt_money(vat_total)

    settings = doc.find('НастрФормДок')
    set_attr(settings,
             ПрНДСВИтог=constants.get('vatCalcInTotalOnly') or '0',
             ПрНакИтог=constants.get('cumulativeMode') or '0',
             ПрИндЦен=constants.get('priceIndexYear') or '0000',
             ПрСведРасчСогл=constants.get('requiresSettlementApproval') or '0')

    signer = doc.find('ПодписантПодр/Подписант/ФИО')
    signer_source = common.get('contractorSigner') or common.get('contractorResponsible') or common.get('signerName') or 'Иванов Иван'
    family, name, patronymic = split_fio(signer_source)
    set_attr(signer, Фамилия=family, Имя=name)
    if patronymic:
        signer.set('Отчество', patronymic)
    elif 'Отчество' in signer.attrib:
        del signer.attrib['Отчество']

    return tree


def main():
    args = parse_args()
    input_path = Path(args.input_json)
    output_path = Path(args.output)
    data = load_json(input_path)
    tree = build_xml(data)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tree.write(str(output_path), encoding='windows-1251', xml_declaration=True, pretty_print=True)
    print(output_path)


if __name__ == '__main__':
    main()
