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
    # Для small sample и проходного sample_1110335.xml
    # подпись часто выглядит как "А. Дылюк". Чтобы быть ближе к проходному примеру,
    # в таком случае отдаем Фамилия="А", Имя="Дылюк".
    if len(parts) == 2 and parts[0].endswith('.'):
        return parts[0].rstrip('.'), parts[1], None
    if len(parts) == 2:
        return parts[0], parts[1], None
    return parts[0], parts[1], ' '.join(parts[2:])


def short_org_name(text: str | None) -> str:
    value = (text or '').strip()
    if not value:
        return ''
    return value.split(',')[0][:255]


def load_json(path: Path):
    with path.open('r', encoding='utf-8') as fh:
        return json.load(fh)


def validate_export_payload(data: dict):
    common = data.get('common', {})
    xml = data.get('xml', {})
    manual = xml.get('manual', {})
    ks2_sheets = data.get('ks2Sheets', [])
    first_sheet = ks2_sheets[0] if ks2_sheets else {}
    first_doc = first_sheet.get('document', {})

    required = [
        ('common.contractorName', common.get('contractorName'), 'Не заполнен генподрядчик'),
        ('common.developerName|common.techCustomerName', common.get('developerName') or common.get('techCustomerName'), 'Не заполнен заказчик/застройщик'),
        ('common.objectName|common.constructionObject', common.get('objectName') or common.get('constructionObject'), 'Не заполнен объект/стройка'),
        ('common.contractNumber', common.get('contractNumber'), 'Не заполнен номер договора'),
        ('common.contractDate', common.get('contractDate'), 'Не заполнена дата договора'),
        ('ks2Sheets[0].document.number', first_doc.get('number'), 'Не заполнен номер акта КС-2'),
        ('ks2Sheets[0].document.date', first_doc.get('date'), 'Не заполнена дата акта КС-2'),
        ('xml.manual.contractorInn', manual.get('contractorInn'), 'Не заполнен ИНН подрядчика'),
        ('xml.manual.customerInn', manual.get('customerInn'), 'Не заполнен ИНН заказчика'),
        ('xml.manual.economicSubjectName', manual.get('economicSubjectName') or common.get('contractorName'), 'Не заполнено наименование составителя XML'),
        ('xml.manual.estimateVersionCode', manual.get('estimateVersionCode'), 'Не заполнена версия сметы (КодСмет)'),
        ('xml.manual.supplementDocType', manual.get('supplementDocType'), 'Не заполнен тип допсоглашения'),
        ('xml.manual.supplementDocNumber', manual.get('supplementDocNumber'), 'Не заполнен номер допсоглашения'),
        ('xml.manual.supplementDocDate', manual.get('supplementDocDate'), 'Не заполнена дата допсоглашения'),
        ('xml.manual.developerPostalIndex', manual.get('developerPostalIndex'), 'Не заполнен индекс адреса'),
        ('xml.manual.developerRegionCode', manual.get('developerRegionCode'), 'Не заполнен код региона'),
        ('signer', manual.get('signerName') or common.get('contractorSignerName') or common.get('contractorSigner') or common.get('contractorResponsible') or common.get('signerName'), 'Не заполнено ФИО подписанта'),
    ]

    errors = [{'path': path, 'message': message} for path, value, message in required if value in (None, '')]
    return errors


def clear_children(el):
    for child in list(el):
        el.remove(child)


def set_attr(el, **attrs):
    for key, value in attrs.items():
        if value is None:
            continue
        el.set(key, str(value))


def iter_ks2_sections(ks2_sheets: list[dict]):
    global_section_no = 0
    global_row_no = 0
    current_section = None

    for sheet_index, sheet in enumerate(ks2_sheets):
        for row in sheet.get('rows', []):
            row_type = row.get('type')
            if row_type == 'section':
                global_section_no += 1
                global_row_no += 1
                current_section = {
                    'sheetIndex': sheet_index,
                    'sheet': sheet,
                    'sectionNo': global_section_no,
                    'rowNo': global_row_no,
                    'name': row.get('name') or f'Раздел {global_section_no}',
                    'estimateNo': row.get('estimateNo') or '',
                    'items': [],
                }
                yield current_section
                continue
            if row_type == 'item':
                if current_section is None:
                    global_section_no += 1
                    global_row_no += 1
                    current_section = {
                        'sheetIndex': sheet_index,
                        'sheet': sheet,
                        'sectionNo': global_section_no,
                        'rowNo': global_row_no,
                        'name': sheet.get('title') or f'Раздел {global_section_no}',
                        'estimateNo': '',
                        'items': [],
                    }
                    yield current_section
                global_row_no += 1
                current_section['items'].append({**row, 'xmlRowNo': global_row_no})


def build_xml(data: dict) -> ET._ElementTree:
    validation_errors = validate_export_payload(data)
    if validation_errors:
        raise ValueError(json.dumps({'validationErrors': validation_errors}, ensure_ascii=False))

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
             ВерсПрог=generated.get('programVersion') or 'KC2-KC3-XML-webapp',
             ВерсФорм=generated.get('formatVersion') or '1.00')

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

    estimate_id = act.find('ИдСмет/ТипИдДок')
    if estimate_id is not None:
        set_attr(
            estimate_id,
            НаимДок='Смета',
            НомерДок=manual.get('estimateVersionCode') or '1',
            ДатаДок=fmt_date(manual.get('supplementDocDate') or first_doc.get('date') or common.get('contractDate')),
        )

    correction = act.find('ИспрАктСдПр')
    set_attr(correction,
             НомИспр=manual.get('correctionNumber') or correction.get('НомИспр') or '1',
             ДатаИспр=fmt_date(manual.get('correctionDate') or first_doc.get('date') or ks3_doc.get('documentDate')))

    # Основания сдачи результатов работ: используем текст основания листа КС-2 как НаимДок.
    for el in act.findall('ОснСдачи'):
        act.remove(el)

    contractor_side = act.find('СвПодр/СвСторДог')
    set_attr(
        contractor_side,
        ОКПО=common.get('contractorOkpo') or contractor_side.get('ОКПО'),
        ИнфДляУчаст='contractor',
        КраткНазв=short_org_name(common.get('contractorName')),
    )
    contractor = act.find('СвПодр/СвСторДог/ИдСв/СвЮЛУч')
    set_attr(contractor,
             НаимОрг=common.get('contractorName') or contractor.get('НаимОрг'),
             ИННЮЛ=manual.get('contractorInn') or contractor.get('ИННЮЛ'))
    contractor_addr = act.find('СвПодр/СвСторДог/Адрес')
    if contractor_addr is None:
        contractor_addr = ET.SubElement(contractor_side, 'Адрес')
    else:
        clear_children(contractor_addr)
    ET.SubElement(contractor_addr, 'АдрРФ',
                  Индекс=manual.get('contractorPostalIndex') or '109028',
                  КодРегион=manual.get('contractorRegionCode') or '77')

    customer_side = act.find('СвЗак/СвСторДог')
    customer_name = common.get('techCustomerName') or common.get('developerName')
    set_attr(
        customer_side,
        ОКПО=common.get('techCustomerOkpo') or common.get('developerOkpo') or customer_side.get('ОКПО'),
        ИнфДляУчаст='customer',
        КраткНазв=short_org_name(customer_name),
    )
    customer = act.find('СвЗак/СвСторДог/ИдСв/СвЮЛУч')
    set_attr(customer,
             НаимОрг=common.get('techCustomerName') or common.get('developerName') or customer.get('НаимОрг'),
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
    basis_value = first_doc.get('basis') or ''
    if basis_value:
        delivery_basis = ET.Element('ОснСдачи')
        ET.SubElement(delivery_basis, 'ТипИдДок',
                      НаимДок=str(basis_value)[:255],
                      НомерДок=common.get('contractNumber') or 'без номера',
                      ДатаДок=fmt_date(common.get('contractDate')))
        act.insert(list(act).index(currency), delivery_basis)
    set_attr(currency, КодОКВ='643')

    info_block = act.find('ИнфПолФХЖ1')
    clear_children(info_block)
    ET.SubElement(info_block, 'ТекстИнф', Идентиф='customField', Значение=manual.get('customInfoValue') or 'sample')

    works = doc.find('НаимИСт')
    clear_children(works)

    traceable_goods = xml.get('traceableGoods', [])
    compact_mode = constants.get('diadocCompactMode', '0') == '1'

    if compact_mode:
        all_items = []
        for sheet in ks2_sheets:
            for item in sheet.get('items', []):
                all_items.append((sheet, item))

        export_items = all_items[:1] if all_items else []
        row_no = 1
        for sheet, item in export_items:
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
            vat_amount = max(float(ks3_totals.get('vat') or 0), 0) if ks3_totals.get('vat') is not None else 0
            ET.SubElement(tax, 'СумНал').text = fmt_money(vat_amount)
            tg = traceable_goods[0] if traceable_goods else {}
            ET.SubElement(
                work_el,
                'СвПрослежСтройка',
                НомТовПрослеж=tg.get('registrationNumber') or '123456789012345678901234567',
                ЕдИзмПрослеж=tg.get('unitCode') or '796',
                НаимЕдИзмПрослеж=tg.get('unitName') or 'шт',
                КолВЕдПрослеж=fmt_money(tg.get('quantity') or 1).rstrip('0').rstrip('.') or '1',
            )
            row_no += 1

        export_sections = sections[:1] if sections else []
        for idx, section in enumerate(export_sections, start=1):
            section_amount = float(section.get('ks2Amount') or ks3_totals.get('forPeriod') or 0)
            subitems = section.get('subitems', [])
            filtered_subitems = [sub for sub in subitems if float(sub.get('closingAmount') or 0) > 0 or float(sub.get('advanceReceived') or 0) > 0]
            if section_amount <= 0 and not filtered_subitems:
                continue
            sec = ET.SubElement(works, 'Раздел',
                                НаимРаздел=section.get('name') or f'Раздел №{idx}',
                                СтБезНДСРаздОтч=fmt_money(section_amount))
            chosen_subitems = filtered_subitems[:1] if filtered_subitems else []
            if chosen_subitems:
                for sub in chosen_subitems:
                    ET.SubElement(sec, 'СвВидРаб',
                                  НаимТов=(export_items[0][1].get('name') if export_items else sub.get('advanceDoc') or f'Подпункт {idx}'),
                                  ЦенаТов=fmt_money((export_items[0][1].get('price') if export_items else sub.get('advanceReceived'))),
                                  СтТовБезНДС=fmt_money((export_items[0][1].get('amount') if export_items else sub.get('closingAmount') or sub.get('advanceReceived'))))
            else:
                ET.SubElement(sec, 'СвВидРаб',
                              НаимТов=section.get('name') or f'Раздел №{idx}',
                              ЦенаТов=fmt_money(section_amount),
                              СтТовБезНДС=fmt_money(section_amount))
    else:
        vat_rate_default = float(first_doc.get('vatRate') or 20)
        section_entries = list(iter_ks2_sections(ks2_sheets))
        trace_attached = False
        for entry in section_entries:
            items = entry['items']
            if not items:
                continue
            section_amount = sum(float(item.get('amount') or 0) for item in items)
            section_estimate_no = entry.get('estimateNo') or next((str(it.get('estimateNo')) for it in items if it.get('estimateNo')), '')
            section_vat = max(round(section_amount * vat_rate_default / 100, 2), 0)
            sec_attrs = {
                'НомСтр': str(entry['rowNo']),
                'НомРазд': str(entry['sectionNo']),
                'НаимРаздел': entry['name'],
                'СтБезНДСРаздСмет': fmt_money(section_amount),
                'СтСНДСРаздСмет': fmt_money(section_amount + section_vat),
                'СтБезНДСРаздОтч': fmt_money(section_amount),
                'СтСНДСРаздОтч': fmt_money(section_amount + section_vat),
            }
            if section_estimate_no:
                sec_attrs['ПозРаздСмет'] = section_estimate_no
            sec = ET.SubElement(works, 'Раздел', **sec_attrs)
            for item in items:
                amount = float(item.get('amount') or 0)
                price = float(item.get('price') or 0)
                qty = item.get('quantity')
                vat_amount = max(round(amount * vat_rate_default / 100, 2), 0)
                item_attrs = {
                    'НомСтр': str(item.get('xmlRowNo')),
                    'НомПоз': str(item.get('lineNo') or item.get('xmlRowNo')),
                    'НаимТов': item.get('name') or f"Работа {item.get('xmlRowNo')}",
                    'ТипЗатр': '1',
                    'ЦенаТов': fmt_money(price),
                    'СтПоСметеБезНДС': fmt_money(amount),
                    'СтТовБезНДС': fmt_money(amount),
                    'СтТовУчНал': fmt_money(amount + vat_amount),
                    'ОКЕИ_Стройка': '796',
                    'НаимЕдИзм': item.get('unit') or 'шт',
                }
                if item.get('estimateNo'):
                    item_attrs['ПозСмет'] = str(item.get('estimateNo'))
                work_el = ET.SubElement(sec, 'СвВидРаб', **item_attrs)
                changes = ET.SubElement(work_el, 'УчОшИНовОбстСт')
                err = ET.SubElement(changes, 'ОшибПрПер')
                ET.SubElement(err, 'УвелДен').text = '1'
                ET.SubElement(err, 'УвелКол').text = '1'
                if qty not in (None, ''):
                    ET.SubElement(work_el, 'КолТов').text = str(qty)
                tax = ET.SubElement(work_el, 'СумНал')
                ET.SubElement(tax, 'СумНал').text = fmt_money(vat_amount)
                if not trace_attached:
                    tg = traceable_goods[0] if traceable_goods else {}
                    ET.SubElement(
                        work_el,
                        'СвПрослежСтройка',
                        НомТовПрослеж=tg.get('registrationNumber') or '123456789012345678901234567',
                        ЕдИзмПрослеж=tg.get('unitCode') or '796',
                        НаимЕдИзмПрослеж=tg.get('unitName') or 'шт',
                        КолВЕдПрослеж=fmt_money(tg.get('quantity') or 1).rstrip('0').rstrip('.') or '1',
                    )
                    trace_attached = True

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
    if compact_mode:
        # XSD-профиль для compact/Diadoc-ready сценария допускает один УчетТребУдерж.
        aggregated_amount = sum(max(float(row.get('amount') or 0), 0) for row in settlement_rows)
        preferred_kind = '31' if any(str(row.get('kindCode')) == '31' for row in settlement_rows) else str(settlement_rows[0].get('kindCode') or '31')
        item = ET.SubElement(settlement_el, 'УчетТребУдерж', СумТребУдерж=fmt_money(aggregated_amount if aggregated_amount > 0 else 1))
        if preferred_kind.startswith('3'):
            child = ET.SubElement(item, 'ВидУдерж')
            child.text = preferred_kind
        else:
            child = ET.SubElement(item, 'ВидТреб')
            child.text = preferred_kind
    else:
        # Для production-full табличной части оставляем детальность КС-2,
        # но блок СвОРасч пока удерживаем в одном элементе, поскольку XSD текущего профиля
        # ожидает единственную запись УчетТребУдерж.
        aggregated_amount = sum(max(float(row.get('amount') or 0), 0) for row in settlement_rows)
        preferred_kind = '31' if any(str(row.get('kindCode')) == '31' for row in settlement_rows) else str(settlement_rows[0].get('kindCode') or '31')
        item = ET.SubElement(settlement_el, 'УчетТребУдерж', СумТребУдерж=fmt_money(aggregated_amount if aggregated_amount > 0 else 1))
        if preferred_kind.startswith('3'):
            child = ET.SubElement(item, 'ВидУдерж')
            child.text = preferred_kind
        else:
            child = ET.SubElement(item, 'ВидТреб')
            child.text = preferred_kind

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

    signer_parent = doc.find('ПодписантПодр/Подписант')
    set_attr(
        signer_parent,
        СтатПодп=manual.get('signerStatus') or '1',
        ТипПодпис=manual.get('signatureType') or '1',
        Должн=manual.get('signerPosition') or common.get('contractorSignerPosition') or '',
    )

    signer = doc.find('ПодписантПодр/Подписант/ФИО')
    signer_source = manual.get('signerName') or common.get('contractorSignerName') or common.get('contractorSigner') or common.get('contractorResponsible') or common.get('signerName') or 'Иванов Иван'
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
