#!/usr/bin/env python3
from __future__ import annotations

import argparse
import copy
import json
import re
from datetime import datetime
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


def first_non_empty(*values, default=None):
    for value in values:
        if value is None:
            continue
        if isinstance(value, str):
            if value.strip() == '':
                continue
            return value.strip()
        return value
    return default


def fmt_date(value: str | None) -> str:
    if not value:
        return '01.01.2026'
    value = str(value).strip().replace(' г.', '').replace(' г', '')
    if len(value) == 10 and value[4] == '-' and value[7] == '-':
        yyyy, mm, dd = value.split('-')
        return f'{dd}.{mm}.{yyyy}'
    return value[:10]


def safe_float(value, default=0.0):
    try:
        return float(value)
    except Exception:
        return default


def first_number(*values, default=None):
    for value in values:
        if value in (None, ''):
            continue
        try:
            return float(value)
        except Exception:
            continue
    return default


def calc_vat(base_amount, vat_rate):
    base = safe_float(base_amount, 0.0)
    rate = safe_float(vat_rate, 0.0)
    return max(round(base * rate / 100, 2), 0)


def resolve_xml_payload(data: dict) -> dict:
    return data.get('xml') or data.get('xmlExtras') or {}


def resolve_cumulative_mode(constants: dict) -> str:
    # Текущее проектное решение: подрядческий P-файл всегда собираем
    # в режиме full cumulative как развернутый аналог КС-3 из Excel.
    return '1'


def build_ks3_sheet_map(ks2_sheets: list[dict], ks3_rows: list[dict]):
    def normalize_name(value):
        return ' '.join(str(value or '').lower().replace('ё', 'е').split())

    def is_total_or_header(row):
        name = normalize_name((row or {}).get('name'))
        if not name:
            return True
        if 'в том числе' in name:
            return True
        if name.startswith('всего') or 'всего работ и затрат' in name or name == 'итого':
            return True
        return False

    rows = [row for row in (ks3_rows or []) if row and not is_total_or_header(row)]
    unused = list(rows)
    mapping = {}

    for index, sheet in enumerate(ks2_sheets):
        sheet_doc = sheet.get('document', {})
        doc_number = str(first_non_empty(sheet_doc.get('number'), sheet.get('documentNumber'), default='')).strip()
        basis = normalize_name(first_non_empty(sheet_doc.get('basis'), sheet.get('basis'), sheet.get('title'), default=''))

        matched = None
        if doc_number:
            patterns = [
                f'акт №{doc_number}',
                f'акт n{doc_number}',
                f'кс-2 №{doc_number}',
                f'кс2 №{doc_number}',
                f'кс-2 n{doc_number}',
                f'кс2 n{doc_number}',
            ]
            for row in unused:
                name = normalize_name(row.get('name'))
                if any(pattern in name for pattern in patterns):
                    matched = row
                    break

        if matched is None and basis:
            tokens = [token for token in re.findall(r'[a-zа-я0-9]+', basis) if len(token) >= 6]
            scored = []
            for row in unused:
                name = normalize_name(row.get('name'))
                score = sum(1 for token in tokens if token in name)
                if score > 0:
                    scored.append((score, row))
            if scored:
                scored.sort(key=lambda item: item[0], reverse=True)
                matched = scored[0][1]

        if matched is None and unused:
            matched = unused[0]

        mapping[index] = matched or {}
        if matched in unused:
            unused.remove(matched)

    return mapping


def resolve_cumulative_amount(source: dict | None, period_amount: float):
    source = source or {}
    return first_number(
        source.get('effectiveFromStart'),
        source.get('fromStart'),
        source.get('amountFromStart'),
        source.get('cumulativeAmount'),
        source.get('amountCumulative'),
        source.get('baseFromStart'),
        default=period_amount,
    )


def resolve_cumulative_quantity(source: dict | None, period_quantity):
    source = source or {}
    return first_number(
        source.get('effectiveQuantityFromStart'),
        source.get('quantityFromStart'),
        source.get('fromStartQuantity'),
        source.get('cumulativeQuantity'),
        source.get('quantityCumulative'),
        default=period_quantity,
    )


def get_correction_kind(source: dict | None) -> str | None:
    source = source or {}
    calc_mode = str(source.get('calcMode') or '').strip().lower()
    correction_kind = str(source.get('correctionKind') or '').strip().lower()
    if calc_mode in {'errorcorrection', 'error_correction', 'pasterror', 'error', 'mistake'}:
        return 'errorCorrection'
    if calc_mode in {'newcircumstances', 'new_circumstances', 'newcircumstance', 'new', 'subtract', 'correction', 'corrective'}:
        return 'newCircumstances'
    if correction_kind in {'errorcorrection', 'error_correction', 'pasterror', 'error'}:
        return 'errorCorrection'
    if correction_kind in {'newcircumstances', 'new_circumstances', 'newcircumstance', 'new'}:
        return 'newCircumstances'
    if str(source.get('isCorrection') or '').strip().lower() in {'1', 'true', 'yes'}:
        return 'newCircumstances'
    for key in ['effectiveAmount', 'effectiveQuantity', 'effectiveFromStart', 'effectiveQuantityFromStart', 'amount', 'quantity', 'fromStart', 'amountFromStart', 'quantityFromStart']:
        numeric = first_number(source.get(key), default=None)
        if numeric is not None and numeric < 0:
            return 'newCircumstances'
    return None


def is_correction_row(source: dict | None) -> bool:
    return get_correction_kind(source) is not None


def resolve_row_amount(source: dict | None):
    source = source or {}
    raw = first_number(source.get('amount'), source.get('effectiveAmount'), default=0.0)
    if is_correction_row(source):
        return abs(raw)
    return raw


def resolve_effective_row_amount(source: dict | None):
    source = source or {}
    explicit = first_number(source.get('effectiveAmount'), default=None)
    if explicit is not None:
        return explicit
    raw = first_number(source.get('amount'), default=0.0)
    return -abs(raw) if is_correction_row(source) else raw


def resolve_row_quantity(source: dict | None):
    source = source or {}
    raw = first_number(source.get('quantity'), source.get('effectiveQuantity'), default=None)
    if raw is None:
        return source.get('quantity')
    if is_correction_row(source):
        return abs(raw)
    return raw


def resolve_effective_row_quantity(source: dict | None):
    source = source or {}
    explicit = first_number(source.get('effectiveQuantity'), default=None)
    if explicit is not None:
        return explicit
    raw = first_number(source.get('quantity'), default=None)
    if raw is None:
        return None
    return -abs(raw) if is_correction_row(source) else raw


def resolve_xml_cumulative_amount(source: dict | None, period_amount: float):
    raw = resolve_cumulative_amount(source, period_amount)
    if raw is None:
        return None
    return abs(raw) if is_correction_row(source) else raw


def resolve_effective_cumulative_amount(source: dict | None, period_amount: float):
    raw = resolve_cumulative_amount(source, period_amount)
    if raw is None:
        return period_amount
    if is_correction_row(source) and first_number((source or {}).get('effectiveFromStart'), default=None) is None:
        return -abs(raw)
    return raw


def resolve_xml_cumulative_quantity(source: dict | None, period_quantity):
    raw = resolve_cumulative_quantity(source, period_quantity)
    if raw is None:
        return None
    return abs(raw) if is_correction_row(source) else raw


def resolve_effective_cumulative_quantity(source: dict | None, period_quantity):
    raw = resolve_cumulative_quantity(source, period_quantity)
    if raw is None:
        return period_quantity
    if is_correction_row(source) and first_number((source or {}).get('effectiveQuantityFromStart'), default=None) is None:
        return -abs(raw)
    return raw


def fmt_quantity(value):
    numeric = first_number(value, default=None)
    if numeric is None:
        return str(value)
    return f'{numeric:.11f}'.rstrip('0').rstrip('.') or '0'


def _initials_from_token(token: str) -> list[str]:
    value = (token or '').strip()
    if not value or '.' not in value:
        return []
    return [part for part in value.replace(' ', '').split('.') if part]


def split_fio(text: str | None):
    parts = [p for p in (text or '').replace(',', ' ').split() if p]
    if not parts:
        return 'Иванов', 'Иван', None
    if len(parts) == 1:
        return parts[0], 'Иван', None

    if len(parts) == 2:
        first_initials = _initials_from_token(parts[0])
        second_initials = _initials_from_token(parts[1])
        if first_initials and not second_initials:
            return parts[1], first_initials[0], first_initials[1] if len(first_initials) > 1 else None
        if second_initials and not first_initials:
            return parts[0], second_initials[0], second_initials[1] if len(second_initials) > 1 else None
        return parts[0], parts[1], None

    if len(parts) == 3 and parts[0].endswith('.') and parts[1].endswith('.'):
        return parts[2], parts[0].rstrip('.'), parts[1].rstrip('.')
    if len(parts) == 3 and parts[1].endswith('.') and parts[2].endswith('.'):
        return parts[0], parts[1].rstrip('.'), parts[2].rstrip('.')

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
    xml = resolve_xml_payload(data)
    manual = xml.get('manual', {})
    ks2_sheets = data.get('ks2Sheets', [])
    first_sheet = ks2_sheets[0] if ks2_sheets else {}
    first_doc = first_sheet.get('document') or {
        'number': first_sheet.get('documentNumber'),
        'date': first_sheet.get('documentDate'),
        'periodFrom': first_sheet.get('periodFrom'),
        'periodTo': first_sheet.get('periodTo'),
        'basis': first_sheet.get('basis'),
        'vatRate': first_sheet.get('vatRate'),
    }

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
        current_section = None
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
                    'sourceRow': row,
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
                        'sourceRow': {},
                        'items': [],
                    }
                    yield current_section
                global_row_no += 1
                current_section['items'].append({**row, 'xmlRowNo': global_row_no})


def parse_input_date(value: str | None):
    normalized = first_non_empty(value)
    if not normalized:
        return None
    normalized = normalized.replace(' г.', '').replace(' г', '')
    for fmt in ('%Y-%m-%d', '%d.%m.%Y'):
        try:
            return datetime.strptime(normalized, fmt)
        except ValueError:
            pass
    return None


def collect_document_periods(ks2_sheets: list[dict], ks3_doc: dict):
    starts = []
    ends = []

    for sheet in ks2_sheets:
        doc = sheet.get('document', {})
        start_dt = parse_input_date(first_non_empty(doc.get('periodFrom'), sheet.get('periodFrom')))
        end_dt = parse_input_date(first_non_empty(doc.get('periodTo'), sheet.get('periodTo'), doc.get('date'), sheet.get('documentDate')))
        if start_dt:
            starts.append(start_dt)
        if end_dt:
            ends.append(end_dt)

    ks3_start = parse_input_date(first_non_empty(ks3_doc.get('periodFrom')))
    ks3_end = parse_input_date(first_non_empty(ks3_doc.get('periodTo'), ks3_doc.get('documentDate')))
    if ks3_start:
        starts.append(ks3_start)
    if ks3_end:
        ends.append(ks3_end)

    start_value = min(starts).strftime('%d.%m.%Y') if starts else None
    end_value = max(ends).strftime('%d.%m.%Y') if ends else None
    return start_value, end_value


def build_operation_text(common: dict):
    return first_non_empty(
        common.get('operationType'),
        common.get('ks2DocSubtitle'),
        default='О ПРИЕМКЕ ВЫПОЛНЕННЫХ РАБОТ',
    )


def normalize_info_pairs(pairs: list[tuple[str, str | None]]):
    normalized = []
    for key, value in pairs:
        prepared = first_non_empty(value)
        if prepared is None:
            continue
        normalized.append((str(key), str(prepared)))
    return normalized


def add_text_info_pairs(info_parent: ET._Element, pairs: list[tuple[str, str | None]]):
    normalized = normalize_info_pairs(pairs)
    if not normalized:
        return None
    for key, value in normalized:
        ET.SubElement(info_parent, 'ТекстИнф', Идентиф=key[:255], Значение=value[:1000])
    return info_parent


def add_info_pairs(parent: ET._Element, pairs: list[tuple[str, str | None]]):
    normalized = normalize_info_pairs(pairs)
    if not normalized:
        return None

    info = ET.SubElement(parent, 'ИнфПолФХЖ2')
    for key, value in normalized:
        ET.SubElement(info, 'ТекстИнф', Идентиф=key[:255], Значение=value[:1000])
    return info


def add_signer_authority(signer_parent: ET._Element, manual: dict):
    status = str(first_non_empty(manual.get('signerStatus'), default='1'))

    if status == '2':
        attrs = {}
        power_id = first_non_empty(manual.get('signerPowerId'), manual.get('signerPowerNumber'))
        power_date = first_non_empty(manual.get('signerPowerDate'))
        internal_number = first_non_empty(manual.get('signerPowerInternalNumber'))
        registration_date = first_non_empty(manual.get('signerPowerRegistrationDate'))
        system_mark = first_non_empty(manual.get('signerPowerSystemMark'))

        if power_id and len(str(power_id)) == 36:
            attrs['НомДовер'] = str(power_id)
        if power_date:
            attrs['ДатаНач'] = fmt_date(power_date)
        if internal_number:
            attrs['ВнНомДовер'] = str(internal_number)
        if registration_date:
            attrs['ДатаВнРегДовер'] = fmt_date(registration_date)
        if system_mark:
            attrs['СведСистОтм'] = str(system_mark)

        if attrs:
            ET.SubElement(signer_parent, 'СвДовер', **attrs)
        return

    if status == '3':
        attrs = {}
        paper_date = first_non_empty(manual.get('signerPaperPowerDate'))
        internal_number = first_non_empty(manual.get('signerPaperPowerInternalNumber'))
        power_identity = first_non_empty(manual.get('signerPaperPowerIdentity'))
        paper_fio = first_non_empty(manual.get('signerPaperPowerFio'))

        if paper_date:
            attrs['ДатаНач'] = fmt_date(paper_date)
        if internal_number:
            attrs['ВнНомДовер'] = str(internal_number)
        if power_identity:
            attrs['СвИдДовер'] = str(power_identity)

        if attrs or paper_fio:
            paper = ET.SubElement(signer_parent, 'СвДоверБум', **attrs)
            if paper_fio:
                family, name, patronymic = split_fio(paper_fio)
                fio = ET.SubElement(paper, 'ФИО', Фамилия=family, Имя=name)
                if patronymic:
                    fio.set('Отчество', patronymic)



def build_xml(data: dict) -> ET._ElementTree:
    validation_errors = validate_export_payload(data)
    if validation_errors:
        raise ValueError(json.dumps({'validationErrors': validation_errors}, ensure_ascii=False))

    parser = ET.XMLParser(remove_blank_text=False)
    tree = ET.parse(str(TEMPLATE_XML), parser)
    root = tree.getroot()
    doc = root.find('Документ')
    common = data.get('common', {})
    xml = resolve_xml_payload(data)
    generated = xml.get('generated', {})
    manual = xml.get('manual', {})
    constants = xml.get('constants', {})
    settlement = xml.get('settlement', {})
    holdbacks = data.get('holdbacks', {})
    sections = holdbacks.get('sections', [])
    ks2_sheets = data.get('ks2Sheets', [])
    first_sheet = ks2_sheets[0] if ks2_sheets else {}
    first_doc = first_sheet.get('document') or {
        'number': first_sheet.get('documentNumber'),
        'date': first_sheet.get('documentDate'),
        'periodFrom': first_sheet.get('periodFrom'),
        'periodTo': first_sheet.get('periodTo'),
        'basis': first_sheet.get('basis'),
        'vatRate': first_sheet.get('vatRate'),
    }
    ks3 = data.get('ks3', {})
    ks3_doc = ks3.get('document', {})
    ks3_totals = ks3.get('totals', {})
    ks3_sheet_map = build_ks3_sheet_map(ks2_sheets, ks3.get('rows', []))
    cumulative_mode = resolve_cumulative_mode(constants)
    vat_in_total_only = str(first_non_empty(constants.get('vatCalcInTotalOnly'), default='0')) == '1'

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

    currency_code = str(first_non_empty(common.get('currencyCode'), default='643'))
    currency_name = first_non_empty(common.get('currencyName'))

    act = doc.find('СвАктСдПр')
    set_attr(act,
             НомерДок=first_doc.get('number') or 'без номера',
             ДатаДок=fmt_date(first_doc.get('date') or ks3_doc.get('documentDate')),
             НаимОб=common.get('objectName') or common.get('constructionObject') or act.get('НаимОб'),
             КодОКВДог=currency_code)

    contract_id = act.find('ИдДог/ТипИдДок')
    set_attr(contract_id,
             НаимДок='Договор генподряда',
             НомерДок=common.get('contractNumber') or 'без номера',
             ДатаДок=fmt_date(common.get('contractDate')))

    estimate_container = act.find('ИдСмет')
    estimate = act.find('ИзмСмет')
    if estimate_container is None:
        estimate_container = ET.Element('ИдСмет')
        if estimate is not None:
            act.insert(list(act).index(estimate), estimate_container)
        else:
            act.append(estimate_container)
    estimate_id = estimate_container.find('ТипИдДок')
    if estimate_id is None:
        estimate_id = ET.SubElement(estimate_container, 'ТипИдДок')
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
    basis_values = []
    seen_basis = set()
    for sheet in ks2_sheets:
        basis_value = first_non_empty(sheet.get('document', {}).get('basis'), sheet.get('basis'))
        if not basis_value:
            continue
        key = str(basis_value).strip()
        if key in seen_basis:
            continue
        seen_basis.add(key)
        basis_values.append(key)

    for el in act.findall('ОснСдачи'):
        act.remove(el)
    insert_index = list(act).index(currency)
    for offset, basis_value in enumerate(basis_values):
        delivery_basis = ET.Element('ОснСдачи')
        ET.SubElement(
            delivery_basis,
            'ТипИдДок',
            НаимДок=str(basis_value)[:255],
            НомерДок=common.get('contractNumber') or 'без номера',
            ДатаДок=fmt_date(common.get('contractDate')),
        )
        act.insert(insert_index + offset, delivery_basis)
    set_attr(currency,
             КодОКВ=currency_code,
             НаимОКВ=currency_name)

    info_block = act.find('ИнфПолФХЖ1')
    clear_children(info_block)
    add_text_info_pairs(info_block, [
        ('customField', manual.get('customInfoValue') or 'sample'),
        ('form.okudKs2', common.get('okudKs2')),
        ('form.okudKs3', common.get('okudKs3')),
        ('form.currencyCode', currency_code),
        ('form.currencyName', currency_name),
        ('form.objectOkpo', common.get('objectOkpo')),
        ('form.okdpCode', common.get('okdpCode')),
        ('developer.name', common.get('developerName')),
        ('developer.okpo', common.get('developerOkpo')),
        ('techCustomer.name', common.get('techCustomerName')),
        ('techCustomer.okpo', common.get('techCustomerOkpo')),
        ('contractor.signerName', common.get('contractorSignerName')),
        ('contractor.signerPosition', common.get('contractorSignerPosition')),
        ('customer.signerName', common.get('customerSignerName')),
        ('customer.signerPosition', common.get('customerSignerPosition')),
        ('techCustomer.signerName', common.get('techCustomerSignerName')),
        ('techCustomer.signerPosition', common.get('techCustomerSignerPosition')),
        ('ks3.documentNumber', first_non_empty(ks3_doc.get('documentNumber'), ks3_doc.get('number'))),
        ('ks3.documentDate', fmt_date(first_non_empty(ks3_doc.get('documentDate'), ks3_doc.get('date'))) if first_non_empty(ks3_doc.get('documentDate'), ks3_doc.get('date')) else None),
        ('ks3.periodFrom', fmt_date(first_non_empty(ks3_doc.get('periodFrom'))) if first_non_empty(ks3_doc.get('periodFrom')) else None),
        ('ks3.periodTo', fmt_date(first_non_empty(ks3_doc.get('periodTo'))) if first_non_empty(ks3_doc.get('periodTo')) else None),
        ('ks3.totalFromStart', fmt_money(first_number(ks3_totals.get('fromStart'), default=0.0)) if ks3_totals else None),
        ('ks3.totalForPeriod', fmt_money(first_number(ks3_totals.get('forPeriod'), default=0.0)) if ks3_totals else None),
    ])

    existing_works = doc.findall('НаимИСт')
    works_insert_index = list(doc).index(existing_works[0]) if existing_works else list(doc).index(doc.find('СвПродПер'))
    for works_el in existing_works:
        doc.remove(works_el)

    traceable_goods = xml.get('traceableGoods', [])
    compact_mode = constants.get('diadocCompactMode', '0') == '1'
    section_entries = list(iter_ks2_sections(ks2_sheets))

    if compact_mode:
        works = ET.Element('НаимИСт')
        doc.insert(works_insert_index, works)

        all_items = []
        for sheet_index, sheet in enumerate(ks2_sheets):
            for item in sheet.get('items', []):
                all_items.append((sheet_index, sheet, item))

        export_items = all_items[:1] if all_items else []
        row_no = 1
        for sheet_index, sheet, item in export_items:
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
            sheet_doc = sheet.get('document', {})
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
            add_info_pairs(work_el, [
                ('ks2.sheetIndex', str(sheet_index + 1)),
                ('ks2.sheetTitle', sheet.get('title')),
                ('ks2.documentNumber', first_non_empty(sheet_doc.get('number'), sheet.get('documentNumber'))),
                ('ks2.documentDate', fmt_date(first_non_empty(sheet_doc.get('date'), sheet.get('documentDate'))) if first_non_empty(sheet_doc.get('date'), sheet.get('documentDate')) else None),
                ('ks2.periodFrom', fmt_date(first_non_empty(sheet_doc.get('periodFrom'), sheet.get('periodFrom'))) if first_non_empty(sheet_doc.get('periodFrom'), sheet.get('periodFrom')) else None),
                ('ks2.periodTo', fmt_date(first_non_empty(sheet_doc.get('periodTo'), sheet.get('periodTo'))) if first_non_empty(sheet_doc.get('periodTo'), sheet.get('periodTo')) else None),
                ('ks2.basis', first_non_empty(sheet_doc.get('basis'), sheet.get('basis'))),
            ])
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
        grouped_sections = {sheet_index: [] for sheet_index, _ in enumerate(ks2_sheets)}
        for entry in section_entries:
            grouped_sections.setdefault(entry['sheetIndex'], []).append(entry)

        trace_attached = False
        inserted_blocks = 0
        for sheet_index, sheet in enumerate(ks2_sheets):
            sheet_sections = grouped_sections.get(sheet_index, [])
            if not sheet_sections:
                continue

            works = ET.Element('НаимИСт')
            doc.insert(works_insert_index + inserted_blocks, works)
            inserted_blocks += 1

            sheet_doc = sheet.get('document', {})
            vat_rate_default = safe_float(sheet_doc.get('vatRate') or first_doc.get('vatRate') or 20)
            sheet_ks3_row = ks3_sheet_map.get(sheet_index, {})
            sheet_cumulative_base = first_number(sheet_ks3_row.get('fromStart'), default=None)
            sheet_for_period_base = first_number(sheet_ks3_row.get('forPeriod'), default=None)
            sheet_metadata_attached = False
            for entry in sheet_sections:
                items = entry['items']
                if not items:
                    continue
                section_amount_raw = sum(resolve_effective_row_amount(item) for item in items)
                section_amount = max(round(section_amount_raw, 2), 0)
                section_estimate_no = entry.get('estimateNo') or next((str(it.get('estimateNo')) for it in items if it.get('estimateNo')), '')
                section_cumulative_amount_raw = sum(resolve_effective_cumulative_amount(item, resolve_effective_row_amount(item)) for item in items)
                section_cumulative_amount = max(round(section_cumulative_amount_raw, 2), 0)
                if section_cumulative_amount == section_amount and len(sheet_sections) == 1 and sheet_cumulative_base is not None:
                    section_cumulative_amount = max(round(sheet_cumulative_base, 2), 0)
                section_vat = calc_vat(section_amount, vat_rate_default)
                section_cumulative_vat = calc_vat(section_cumulative_amount, vat_rate_default)
                sec_attrs = {
                    'НомСтр': str(entry['rowNo']),
                    'НомРазд': str(entry['sectionNo']),
                    'НаимРаздел': entry['name'],
                    'СтБезНДСРаздСмет': fmt_money(section_amount),
                    'СтСНДСРаздСмет': fmt_money(section_amount + section_vat),
                    'СтБезНДСРаздОтч': fmt_money(section_amount),
                    'СтСНДСРаздОтч': fmt_money(section_amount + section_vat),
                }
                if cumulative_mode == '1':
                    sec_attrs['СтБезНДСРаздСНач'] = fmt_money(section_cumulative_amount)
                    sec_attrs['СтСНДСРаздСНач'] = fmt_money(section_cumulative_amount + section_cumulative_vat)
                if section_estimate_no:
                    sec_attrs['ПозРаздСмет'] = section_estimate_no
                sec = ET.SubElement(works, 'Раздел', **sec_attrs)
                for item in items:
                    correction_kind = get_correction_kind(item)
                    correction_row = correction_kind is not None
                    amount = resolve_row_amount(item)
                    effective_amount = resolve_effective_row_amount(item)
                    price = safe_float(item.get('price') or 0)
                    qty = resolve_row_quantity(item)
                    effective_qty = resolve_effective_row_quantity(item)
                    cumulative_amount = resolve_xml_cumulative_amount(item, amount)
                    if cumulative_amount == amount and len(items) == 1 and cumulative_mode == '1':
                        cumulative_amount = section_cumulative_amount
                    cumulative_qty = resolve_xml_cumulative_quantity(item, qty)
                    vat_amount = calc_vat(amount, vat_rate_default)
                    cumulative_vat_amount = calc_vat(cumulative_amount, vat_rate_default)
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
                    if cumulative_mode == '1':
                        item_attrs['СтСНачСтрБезНДС'] = fmt_money(cumulative_amount)
                    if correction_kind == 'errorCorrection':
                        item_attrs['ПрИспрОш'] = '1'
                    elif correction_kind == 'newCircumstances':
                        item_attrs['ПрНовОбст'] = '1'
                    if item.get('estimateNo'):
                        item_attrs['ПозСмет'] = str(item.get('estimateNo'))
                    work_el = ET.SubElement(sec, 'СвВидРаб', **item_attrs)
                    if correction_row:
                        changes = ET.SubElement(work_el, 'УчОшИНовОбстСт')
                        change_tag = 'ОшибПрПер' if correction_kind == 'errorCorrection' else 'НовОбстПрПер'
                        err = ET.SubElement(changes, change_tag)
                        ET.SubElement(err, 'УменьшДен').text = fmt_money(abs(effective_amount))
                        qty_delta = abs(first_number(effective_qty, default=0.0) or 0.0)
                        if qty_delta > 0:
                            ET.SubElement(err, 'УменьшКол').text = fmt_quantity(qty_delta)
                        else:
                            ET.SubElement(err, 'НетИзмКол').text = 'без изм'
                    if qty not in (None, ''):
                        ET.SubElement(work_el, 'КолТов').text = fmt_quantity(qty)
                    if cumulative_mode == '1' and cumulative_qty not in (None, ''):
                        ET.SubElement(work_el, 'КолСНач').text = fmt_quantity(cumulative_qty)
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
                    add_info_pairs(work_el, [
                        ('ks2.rowCode', item.get('code')),
                        ('ks2.unitConsumption', str(item.get('unitConsumption')) if item.get('unitConsumption') not in (None, '') else None),
                        ('ks2.calcMode', item.get('calcMode')),
                        ('ks2.correctionKind', correction_kind),
                        ('ks2.isCorrection', '1' if correction_row else None),
                        ('ks2.effectiveAmount', fmt_money(effective_amount) if correction_row else None),
                    ])
                    if not sheet_metadata_attached:
                        add_info_pairs(work_el, [
                            ('ks2.sheetIndex', str(sheet_index + 1)),
                            ('ks2.sheetTitle', sheet.get('title')),
                            ('ks2.documentNumber', first_non_empty(sheet_doc.get('number'), sheet.get('documentNumber'))),
                            ('ks2.documentDate', fmt_date(first_non_empty(sheet_doc.get('date'), sheet.get('documentDate'))) if first_non_empty(sheet_doc.get('date'), sheet.get('documentDate')) else None),
                            ('ks2.periodFrom', fmt_date(first_non_empty(sheet_doc.get('periodFrom'), sheet.get('periodFrom'))) if first_non_empty(sheet_doc.get('periodFrom'), sheet.get('periodFrom')) else None),
                            ('ks2.periodTo', fmt_date(first_non_empty(sheet_doc.get('periodTo'), sheet.get('periodTo'))) if first_non_empty(sheet_doc.get('periodTo'), sheet.get('periodTo')) else None),
                            ('ks2.basis', first_non_empty(sheet_doc.get('basis'), sheet.get('basis'))),
                            ('ks2.vatRate', str(first_non_empty(sheet_doc.get('vatRate'), first_doc.get('vatRate')))),
                            ('ks3.sheetFromStart', fmt_money(sheet_cumulative_base) if sheet_cumulative_base is not None else None),
                            ('ks3.sheetForPeriod', fmt_money(sheet_for_period_base) if sheet_for_period_base is not None else None),
                        ])
                        sheet_metadata_attached = True
                if not vat_in_total_only:
                    ET.SubElement(sec, 'СумНалРаздСмет').text = fmt_money(section_vat)
                    ET.SubElement(sec, 'СумНалРаздОтч').text = fmt_money(section_vat)
                    if cumulative_mode == '1':
                        ET.SubElement(sec, 'СумНалРаздСНач').text = fmt_money(section_cumulative_vat)

    transfer = doc.find('СвПродПер')
    clear_children(transfer)
    period_from, period_to = collect_document_periods(ks2_sheets, ks3_doc)
    transfer_attrs = {
        'СодОпер': build_operation_text(common),
    }
    if period_from:
        transfer_attrs['НачПерВДок'] = fmt_date(period_from)
    if period_to:
        transfer_attrs['ОконПерВДок'] = fmt_date(period_to)
    ET.SubElement(transfer, 'СвПер', **transfer_attrs)

    settlement_el = doc.find('СвОРасч')
    clear_children(settlement_el)
    set_attr(settlement_el,
             СумУдержВсегоОтч=fmt_money(settlement.get('totalRetention')),
             СумТребВсегоОтч=fmt_money(settlement.get('totalClaims')),
             ВсегоКОплатОтч=fmt_money(holdbacks.get('totals', {}).get('payableAmount') or ks3_totals.get('forPeriod')))
    settlement_rows = settlement.get('settlementRows', []) or [{'amount': 1, 'kindCode': '31'}]
    aggregated_amount = sum(max(float(row.get('amount') or 0), 0) for row in settlement_rows)
    preferred_kind = '31' if any(str(row.get('kindCode')) == '31' for row in settlement_rows) else str(settlement_rows[0].get('kindCode') or '31')
    item = ET.SubElement(settlement_el, 'УчетТребУдерж', СумТребУдерж=fmt_money(aggregated_amount if aggregated_amount > 0 else 1))
    if preferred_kind.startswith('3'):
        child = ET.SubElement(item, 'ВидУдерж')
        child.text = preferred_kind
    else:
        child = ET.SubElement(item, 'ВидТреб')
        child.text = preferred_kind

    # Для текущего XSD-профиля УчетТребУдерж оставляем агрегированным,
    # но передаем подтверждающий документ из первой релевантной строки удержания/требования.
    supporting_row = next((row for row in settlement_rows if row.get('documentRef')), None)
    if supporting_row:
        document_ref = str(supporting_row.get('documentRef') or '').strip()
        doc_name = 'Документ-основание удержания'
        doc_number = document_ref or 'Без номера'
        doc_date = fmt_date(common.get('contractDate'))
        import re
        m = re.search(r'^(.*?)\s+от\s+(\d{2}\.\d{2}\.\d{4})', document_ref)
        if m:
            doc_number = m.group(1).strip() or doc_number
            doc_date = m.group(2)
        doc_block = ET.SubElement(item, 'ДокПодтСумУд')
        ET.SubElement(doc_block, 'ТипИдДок', НаимДок=doc_name, НомерДок=doc_number, ДатаДок=doc_date)

    total_el = doc.find('ВсегоАктОтч')
    clear_children(total_el)
    total_base = first_number(ks3_totals.get('forPeriod'), default=0.0)
    vat_total = first_number(ks3_totals.get('vatForPeriod'), ks3_totals.get('vat'), default=0.0)
    total_with_vat = total_base + vat_total
    total_attrs = {
        'СтТовБезНДСВсего': fmt_money(total_base),
        'СтТовУчНалВсего': fmt_money(total_with_vat),
    }
    if currency_code != '643':
        total_attrs['СтУчНалВсВалДог'] = fmt_money(total_with_vat)
        if vat_total > 0:
            total_attrs['СумНалВсВалДог'] = fmt_money(vat_total)
    set_attr(total_el, **total_attrs)
    ET.SubElement(total_el, 'СумНалВсего').text = fmt_money(vat_total)
    by_rate = ET.SubElement(total_el, 'СумПоСтавке', НалСт='20%', НалБаза=fmt_money(total_base))
    ET.SubElement(by_rate, 'СумНДС').text = fmt_money(vat_total)

    total_start_el = doc.find('ВсегоАктСНач')
    if cumulative_mode == '1':
        if total_start_el is None:
            total_start_el = ET.Element('ВсегоАктСНач')
            settings_ref = doc.find('НастрФормДок')
            doc.insert(list(doc).index(settings_ref), total_start_el)
        clear_children(total_start_el)
        total_base_start = first_number(ks3_totals.get('fromStart'), total_base, default=total_base)
        vat_total_start = first_number(
            ks3_totals.get('vatFromStart'),
            ks3_totals.get('fromStartVat'),
            ks3_totals.get('vatCumulative'),
            vat_total,
            default=vat_total,
        )
        total_with_vat_start = total_base_start + vat_total_start
        total_start_attrs = {
            'СтТовБезНДСВсего': fmt_money(total_base_start),
            'СтТовУчНалВсего': fmt_money(total_with_vat_start),
        }
        if currency_code != '643':
            total_start_attrs['СтУчНалВсВалДог'] = fmt_money(total_with_vat_start)
            if vat_total_start > 0:
                total_start_attrs['СумНалВсВалДог'] = fmt_money(vat_total_start)
        set_attr(total_start_el, **total_start_attrs)
        ET.SubElement(total_start_el, 'СумНалВсего').text = fmt_money(vat_total_start)
        by_rate_start = ET.SubElement(total_start_el, 'СумПоСтавке', НалСт='20%', НалБаза=fmt_money(total_base_start))
        ET.SubElement(by_rate_start, 'СумНДС').text = fmt_money(vat_total_start)
    elif total_start_el is not None:
        doc.remove(total_start_el)

    settings = doc.find('НастрФормДок')
    set_attr(settings,
             ПрНДСВИтог=constants.get('vatCalcInTotalOnly') or '0',
             ПрНакИтог=cumulative_mode,
             ПрИндЦен=constants.get('priceIndexYear') or '0000',
             ПрСведРасчСогл=constants.get('requiresSettlementApproval') or '0')

    signer_parent = doc.find('ПодписантПодр/Подписант')
    set_attr(
        signer_parent,
        СтатПодп=manual.get('signerStatus') or '1',
        ТипПодпис=manual.get('signatureType') or '1',
        ИдСистХран=first_non_empty(manual.get('signatureStorageId')),
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
    add_signer_authority(signer_parent, manual)

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
