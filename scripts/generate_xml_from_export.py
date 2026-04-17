#!/usr/bin/env python3
from __future__ import annotations

import argparse
import copy
import json
import re
from datetime import datetime
from pathlib import Path
from lxml import etree as ET
from single_sheet_state_helpers import strip_redundant_single_sheet_bindings

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_XML = ROOT / 'nalog docs' / 'пример xml 1110335.xml'
DEFAULT_OUTPUT = ROOT / 'output' / 'generated_1110335.xml'


def parse_args():
    parser = argparse.ArgumentParser(description='Generate XML 1110335 from exported KC2-KC3 JSON model')
    parser.add_argument('input_json', help='Path to exported JSON from web form')
    parser.add_argument('-o', '--output', default=str(DEFAULT_OUTPUT), help='Output XML path')
    parser.add_argument('--sheet-index', type=int, help='Export only one KS2 sheet (1-based index)')
    parser.add_argument('--split-by-ks2', action='store_true', help='Generate a separate XML for every KS2 sheet')
    parser.add_argument('--output-dir', help='Output directory for --split-by-ks2 mode')
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


def normalize_settlement_kind(value, code=None) -> str:
    raw = str(value or '').strip().lower()
    if raw in ('claim', 'видтреб', 'requirement'):
        return 'claim'
    if raw in ('withhold', 'видудерж', 'retention', 'withholding'):
        return 'withhold'
    code_text = str(code or '').strip()
    if code_text.startswith('0'):
        return 'claim'
    return 'withhold'


def choose_preferred_settlement_row(rows: list[dict], total_claims=0.0, total_retention=0.0, representative_row: dict | None = None) -> dict | None:
    if representative_row and safe_float(representative_row.get('amount') or 0, 0.0) > 0:
        return representative_row
    if not rows:
        return None

    total_claims = safe_float(total_claims, 0.0)
    total_retention = safe_float(total_retention, 0.0)
    claim_rows = [row for row in rows if normalize_settlement_kind(row.get('kind'), row.get('kindCode')) == 'claim']
    withhold_rows = [row for row in rows if normalize_settlement_kind(row.get('kind'), row.get('kindCode')) == 'withhold']

    if total_claims > 0 and total_retention <= 0 and claim_rows:
        return claim_rows[0]
    if total_retention > 0 and total_claims <= 0 and withhold_rows:
        return (
            next((row for row in withhold_rows if str(row.get('kindCode') or '').strip() == '32'), None)
            or next((row for row in withhold_rows if str(row.get('kindCode') or '').strip() == '31'), None)
            or withhold_rows[0]
        )
    return rows[0]


def calc_vat(base_amount, vat_rate):
    base = safe_float(base_amount, 0.0)
    rate = safe_float(vat_rate, 0.0)
    return max(round(base * rate / 100, 2), 0)


def split_vat_inclusive_amount(amount, vat_rate):
    gross = safe_float(amount, 0.0)
    rate = safe_float(vat_rate, 0.0)
    sign = -1.0 if gross < 0 else 1.0
    gross_abs = abs(gross)
    if rate <= 0:
        base_abs = round(gross_abs, 2)
        vat_abs = 0.0
    else:
        base_abs = round(gross_abs / (1 + rate / 100), 2)
        vat_abs = round(gross_abs - base_abs, 2)
    return {
        'base': round(base_abs * sign, 2),
        'vat': round(vat_abs * sign, 2),
        'gross': round(gross_abs * sign, 2),
    }


def merge_xml_scopes(*scopes) -> dict:
    merged = {}
    for scope in scopes:
        if isinstance(scope, dict):
            merged.update({key: value for key, value in scope.items() if value is not None})
    return merged


def resolve_document_context(data: dict) -> dict:
    document_context = data.setdefault('documentContext', {})
    common = data.setdefault('common', {})
    merged = {**common, **document_context}
    data['documentContext'] = merged
    data['common'] = merged
    return merged


def resolve_xml_extras_payload(data: dict) -> dict:
    xml_extras = data.setdefault('xmlExtras', {})
    traceable_goods = xml_extras.get('traceableGoods')
    if traceable_goods is None:
        xml_extras['traceableGoods'] = []
    settlement_rows = xml_extras.get('settlementRows')
    if settlement_rows is None:
        xml_extras['settlementRows'] = []
    return xml_extras


def resolve_xml_p_payload(data: dict) -> dict:
    legacy_xml = data.setdefault('xml', {})
    xml_p = data.setdefault('xmlP', {})
    xml_extras = resolve_xml_extras_payload(data)

    xml_p['generated'] = merge_xml_scopes(legacy_xml.get('generated'), xml_p.get('generated'))
    xml_p['constants'] = merge_xml_scopes(legacy_xml.get('constants'), xml_p.get('constants'))
    xml_p['manual'] = merge_xml_scopes(legacy_xml.get('manual'), xml_p.get('manual'))

    traceable_goods = xml_p.get('traceableGoods')
    if traceable_goods is None:
        traceable_goods = legacy_xml.get('traceableGoods')
    if traceable_goods is None:
        traceable_goods = xml_extras.get('traceableGoods', [])
    xml_p['traceableGoods'] = copy.deepcopy(traceable_goods)
    return xml_p


def resolve_xml_z_payload(data: dict) -> dict:
    legacy_xml = data.setdefault('xml', {})
    xml_p = data.setdefault('xmlP', {})
    xml_z = data.setdefault('xmlZ', {})
    xml_z['manual'] = merge_xml_scopes(legacy_xml.get('manual'), xml_p.get('manual'), xml_z.get('manual'))
    return xml_z


def resolve_xml_payload(data: dict) -> dict:
    legacy_xml = data.setdefault('xml', {})
    xml_p = resolve_xml_p_payload(data)
    xml_z = data.setdefault('xmlZ', {})
    xml_extras = resolve_xml_extras_payload(data)

    legacy_xml['generated'] = merge_xml_scopes(legacy_xml.get('generated'), xml_p.get('generated'))
    legacy_xml['constants'] = merge_xml_scopes(legacy_xml.get('constants'), xml_p.get('constants'))
    legacy_xml['manual'] = merge_xml_scopes(legacy_xml.get('manual'), xml_p.get('manual'), xml_z.get('manual'))
    if 'traceableGoods' not in legacy_xml:
        legacy_xml['traceableGoods'] = copy.deepcopy(xml_p.get('traceableGoods', []))
    legacy_xml.setdefault('settlement', {})
    manual_rows = legacy_xml['settlement'].get('manualRows')
    if not isinstance(manual_rows, list) or not manual_rows:
        legacy_xml['settlement']['manualRows'] = copy.deepcopy(xml_extras.get('settlementRows', []))
    else:
        legacy_xml['settlement']['manualRows'] = manual_rows
    return legacy_xml


def should_include_holdbacks_in_xml(data: dict) -> bool:
    holdbacks = data.get('holdbacks', {}) or {}
    return holdbacks.get('includeInXml') is not False


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


def resolve_expense_type(source: dict | None) -> str:
    source = source or {}
    value = first_non_empty(source.get('expenseType'), source.get('typeZatr'), default='1')
    value = str(value).strip()
    return value if value in {'1', '2', '3', '4', '5', '6'} else '1'


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
    common = resolve_document_context(data)
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

    is_correction_act = str(first_non_empty(manual.get('isCorrectionAct'), default='0')) == '1'
    has_estimate_change = str(first_non_empty(manual.get('hasEstimateChange'), default='1')) == '1'

    required = [
        ('common.contractorName', common.get('contractorName'), 'Не заполнен генподрядчик'),
        ('common.developerName|common.techCustomerName', common.get('developerName') or common.get('techCustomerName'), 'Не заполнен заказчик/застройщик'),
        ('common.objectName|common.constructionObject', common.get('objectName') or common.get('constructionObject'), 'Не заполнен объект/стройка'),
        ('common.contractNumber', common.get('contractNumber'), 'Не заполнен номер договора'),
        ('common.contractDate', common.get('contractDate'), 'Не заполнена дата договора'),
        ('ks2Sheets[0].document.number', first_doc.get('number'), 'Не заполнен номер акта КС-2'),
        ('ks2Sheets[0].document.date', first_doc.get('date'), 'Не заполнена дата акта КС-2'),
        ('xml.manual.economicSubjectName', manual.get('economicSubjectName') or common.get('contractorName'), 'Не заполнено наименование составителя XML'),
        ('signer', manual.get('signerName') or common.get('contractorSignerName') or common.get('contractorSigner') or common.get('contractorResponsible') or common.get('signerName'), 'Не заполнено ФИО подписанта'),
    ]
    if is_correction_act:
        required.extend([
            ('xml.manual.correctionNumber', manual.get('correctionNumber'), 'Не заполнен номер исправления'),
            ('xml.manual.correctionDate', manual.get('correctionDate'), 'Не заполнена дата исправления'),
        ])
    # In single-sheet mode these XML manual fields may legitimately come from
    # generator/template fallbacks instead of explicit UI input, so they are not
    # hard export blockers here. The frontend still surfaces them as warnings.

    errors = [{'path': path, 'message': message} for path, value, message in required if value in (None, '')]

    normalized_sheet_ids = [str(first_non_empty(sheet.get('id'), default='')).strip() for sheet in ks2_sheets if first_non_empty(sheet.get('id'))]
    duplicate_sheet_ids = sorted({sheet_id for sheet_id in normalized_sheet_ids if normalized_sheet_ids.count(sheet_id) > 1})
    for sheet_id in duplicate_sheet_ids:
        errors.append({
            'path': 'ks2Sheets',
            'message': f'Идентификатор листа КС-2 должен быть уникальным. Повторяется: {sheet_id}.',
        })

    errors.extend(collect_holdback_sheet_binding_errors(data))
    errors.extend(collect_manual_settlement_sheet_binding_errors(data))
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
            row_type = str(row.get('type') or 'item').strip().lower()
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
            if row_type == 'note':
                continue
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


def parse_supporting_document_ref(value: str | None) -> dict:
    raw = str(first_non_empty(value, default='') or '').strip()
    parsed = {
        'documentRef': raw,
        'documentNumber': None,
        'documentDate': None,
        'documentExtra': None,
    }
    if not raw:
        return parsed

    normalized = raw.replace(' г.', '').replace(' г', '')
    match = re.match(r'^(.*?)\s+от\s+(\d{2}\.\d{2}\.\d{4})(.*)$', normalized, flags=re.IGNORECASE)
    if not match:
        return parsed

    parsed['documentNumber'] = match.group(1).strip() or None
    parsed['documentDate'] = match.group(2)
    parsed['documentExtra'] = match.group(3).strip() or None
    return parsed


def collect_document_periods(ks2_sheets: list[dict]):
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

    start_value = min(starts).strftime('%d.%m.%Y') if starts else None
    end_value = max(ends).strftime('%d.%m.%Y') if ends else None
    return start_value, end_value


def build_ks2_xml_totals(ks2_sheets: list[dict]):
    totals = {
        'forPeriod': 0.0,
        'vatForPeriod': 0.0,
        'fromStart': 0.0,
        'vatFromStart': 0.0,
    }

    for entry in list(iter_ks2_sections(ks2_sheets)):
        items = entry.get('items', [])
        if not items:
            continue
        sheet = entry.get('sheet', {})
        sheet_doc = sheet.get('document', {})
        vat_rate = safe_float(first_non_empty(sheet_doc.get('vatRate'), sheet.get('vatRate')), 20.0)

        section_gross_raw = sum(resolve_effective_row_amount(item) for item in items)
        section_gross = max(round(section_gross_raw, 2), 0.0)
        cumulative_gross_raw = sum(resolve_effective_cumulative_amount(item, resolve_effective_row_amount(item)) for item in items)
        cumulative_gross = max(round(cumulative_gross_raw, 2), section_gross)
        section_amounts = split_vat_inclusive_amount(section_gross, vat_rate)
        cumulative_amounts = split_vat_inclusive_amount(cumulative_gross, vat_rate)

        totals['forPeriod'] += section_amounts['base']
        totals['vatForPeriod'] += section_amounts['vat']
        totals['fromStart'] += cumulative_amounts['base']
        totals['vatFromStart'] += cumulative_amounts['vat']

    return {key: round(value, 2) for key, value in totals.items()}


def compute_holdback_subitem(row: dict) -> dict:
    advance_received = safe_float(row.get('advanceReceived'), 0.0)
    previous_balance = safe_float(
        row.get('previousBalance') if row.get('previousBalance') not in (None, '') else advance_received,
        advance_received,
    )
    closing_amount = safe_float(row.get('closingAmount'), 0.0)
    next_balance = round(max(previous_balance - closing_amount, 0.0), 2)
    return {
        'advanceReceived': round(advance_received, 2),
        'previousBalance': round(previous_balance, 2),
        'closingAmount': round(closing_amount, 2),
        'nextBalance': next_balance,
        'retentionAmount': 0.0,
        'payableAmount': 0.0,
    }


def build_holdback_sections_from_rows(rows: list[dict]):
    groups = []
    current_group = None

    for row_index, raw_row in enumerate(rows or []):
        row = copy.deepcopy(raw_row or {})
        kind = str(row.get('kind') or 'section').strip().lower()
        if kind != 'subitem' or current_group is None:
            current_group = {
                'section': row,
                'rowIndex': row_index,
                'subitems': [],
            }
            groups.append(current_group)
            continue
        current_group['subitems'].append({
            'row': row,
            'rowIndex': row_index,
        })

    sections = []
    for section_index, group in enumerate(groups):
        section_row = copy.deepcopy(group['section'])
        ks2_amount = safe_float(section_row.get('ks2Amount'), 0.0)
        retention_rate = safe_float(section_row.get('retentionRate'), 0.0)

        advance_received = 0.0
        previous_balance = 0.0
        closing_amount = 0.0
        next_balance = 0.0
        prepared_subitems = []

        for entry in group['subitems']:
            row = copy.deepcopy(entry['row'])
            computed = compute_holdback_subitem(row)
            advance_received += computed['advanceReceived']
            previous_balance += computed['previousBalance']
            closing_amount += computed['closingAmount']
            next_balance += computed['nextBalance']
            prepared_subitems.append({
                **row,
                **computed,
                'rowIndex': entry['rowIndex'],
            })

        retention_amount = round(ks2_amount * retention_rate / 100, 2)
        payable_amount = round(ks2_amount - closing_amount - retention_amount, 2)
        sections.append({
            **section_row,
            'sectionIndex': section_index,
            'rowIndex': group['rowIndex'],
            'advanceReceived': round(advance_received, 2),
            'previousBalance': round(previous_balance, 2),
            'closingAmount': round(closing_amount, 2),
            'nextBalance': round(next_balance, 2),
            'retentionAmount': retention_amount,
            'payableAmount': payable_amount,
            'subitems': prepared_subitems,
        })

    return sections


def resolve_holdback_sections(data: dict) -> list[dict]:
    if not should_include_holdbacks_in_xml(data):
        return []
    holdbacks = data.get('holdbacks', {}) or {}
    sections = holdbacks.get('sections') or []
    if sections:
        return copy.deepcopy(sections)
    rows = holdbacks.get('rows') or []
    if rows:
        return build_holdback_sections_from_rows(rows)
    return []


def resolve_holdback_sheet_id(section: dict) -> str | None:
    value = first_non_empty(section.get('ks2SheetId'), section.get('linkedKs2SheetId'), section.get('sheetId'))
    return str(value).strip() if value not in (None, '') else None


def resolve_holdback_sheet_index(section: dict):
    return first_non_empty(section.get('ks2SheetIndex'), section.get('linkedSheetIndex'))


def holdback_section_matches_sheet(section: dict, sheet: dict) -> bool:
    sheet_id = first_non_empty(sheet.get('id'))
    explicit_sheet_id = resolve_holdback_sheet_id(section)
    explicit_sheet_index = resolve_holdback_sheet_index(section)
    sheet_index = sheet.get('sheetIndex')

    if sheet_id and explicit_sheet_id and str(explicit_sheet_id) == str(sheet_id):
        return True
    if explicit_sheet_index not in (None, '') and sheet_index is not None:
        try:
            return int(explicit_sheet_index) == int(sheet_index)
        except Exception:
            return False
    return False


def collect_holdback_sheet_binding_errors(data: dict) -> list[dict]:
    ks2_sheets = data.get('ks2Sheets', []) or []
    if len(ks2_sheets) <= 1:
        return []

    sections = resolve_holdback_sections(data)
    if not sections:
        return []

    valid_sheet_ids = {str(first_non_empty(sheet.get('id'), default='')).strip() for sheet in ks2_sheets if first_non_empty(sheet.get('id'))}
    max_sheet_index = len(ks2_sheets) - 1
    errors = []

    for index, section in enumerate(sections):
        explicit_sheet_id = resolve_holdback_sheet_id(section)
        explicit_sheet_index = resolve_holdback_sheet_index(section)
        label = first_non_empty(section.get('name'), default=f'строка {index + 1}')
        path = f'holdbacks.sections.{index}.ks2SheetId'

        if not explicit_sheet_id and explicit_sheet_index in (None, ''):
            errors.append({
                'path': path,
                'message': f'Для multi-KS2 строка удержаний «{label}» должна быть явно привязана к листу КС-2 (ks2SheetId).',
            })
            continue

        if explicit_sheet_id and explicit_sheet_id not in valid_sheet_ids:
            errors.append({
                'path': path,
                'message': f'Для строки удержаний «{label}» указан неизвестный ks2SheetId: {explicit_sheet_id}.',
            })
            continue

        if explicit_sheet_index not in (None, ''):
            try:
                numeric_index = int(explicit_sheet_index)
            except Exception:
                errors.append({
                    'path': path,
                    'message': f'Для строки удержаний «{label}» указан некорректный индекс листа КС-2: {explicit_sheet_index}.',
                })
                continue
            if numeric_index < 0 or numeric_index > max_sheet_index:
                errors.append({
                    'path': path,
                    'message': f'Для строки удержаний «{label}» индекс листа КС-2 вне диапазона: {numeric_index}.',
                })

    return errors


def resolve_settlement_sheet_id(row: dict) -> str | None:
    value = first_non_empty(row.get('ks2SheetId'), row.get('linkedKs2SheetId'), row.get('sheetId'))
    return str(value).strip() if value not in (None, '') else None


def resolve_settlement_sheet_index(row: dict):
    return first_non_empty(row.get('ks2SheetIndex'), row.get('linkedSheetIndex'))


def manual_settlement_row_matches_sheet(row: dict, sheet: dict) -> bool:
    sheet_id = first_non_empty(sheet.get('id'))
    explicit_sheet_id = resolve_settlement_sheet_id(row)
    explicit_sheet_index = resolve_settlement_sheet_index(row)
    sheet_index = sheet.get('sheetIndex')

    if sheet_id and explicit_sheet_id and str(explicit_sheet_id) == str(sheet_id):
        return True
    if explicit_sheet_index not in (None, '') and sheet_index is not None:
        try:
            return int(explicit_sheet_index) == int(sheet_index)
        except Exception:
            return False
    return False


def is_active_manual_settlement_row(row: dict) -> bool:
    amount = safe_float(row.get('amount'), 0.0)
    return any([
        amount > 0,
        first_non_empty(row.get('documentRef')),
        first_non_empty(row.get('comment')),
        first_non_empty(row.get('customKindText'), row.get('otherKindText')),
    ])


def collect_manual_settlement_sheet_binding_errors(data: dict) -> list[dict]:
    ks2_sheets = data.get('ks2Sheets', []) or []
    if len(ks2_sheets) <= 1:
        return []

    settlement = resolve_xml_payload(data).get('settlement', {})
    manual_rows = settlement.get('manualRows', []) or []
    if not manual_rows:
        return []

    valid_sheet_ids = {str(first_non_empty(sheet.get('id'), default='')).strip() for sheet in ks2_sheets if first_non_empty(sheet.get('id'))}
    max_sheet_index = len(ks2_sheets) - 1
    errors = []

    for index, row in enumerate(manual_rows):
        if not is_active_manual_settlement_row(row):
            continue

        explicit_sheet_id = resolve_settlement_sheet_id(row)
        explicit_sheet_index = resolve_settlement_sheet_index(row)
        label = first_non_empty(row.get('comment'), row.get('documentRef'), default=f'строка {index + 1}')
        path = f'xml.settlement.manualRows.{index}.ks2SheetId'

        if not explicit_sheet_id and explicit_sheet_index in (None, ''):
            errors.append({
                'path': path,
                'message': f'Для multi-KS2 ручная строка расчётов «{label}» должна быть явно привязана к листу КС-2 (ks2SheetId).',
            })
            continue

        if explicit_sheet_id and explicit_sheet_id not in valid_sheet_ids:
            errors.append({
                'path': path,
                'message': f'Для ручной строки расчётов «{label}» указан неизвестный ks2SheetId: {explicit_sheet_id}.',
            })
            continue

        if explicit_sheet_index not in (None, ''):
            try:
                numeric_index = int(explicit_sheet_index)
            except Exception:
                errors.append({
                    'path': path,
                    'message': f'Для ручной строки расчётов «{label}» указан некорректный индекс листа КС-2: {explicit_sheet_index}.',
                })
                continue
            if numeric_index < 0 or numeric_index > max_sheet_index:
                errors.append({
                    'path': path,
                    'message': f'Для ручной строки расчётов «{label}» индекс листа КС-2 вне диапазона: {numeric_index}.',
                })

    return errors


def select_holdback_sections_for_sheet(sections: list[dict], sheet: dict) -> list[dict]:
    matched = []
    for section in sections or []:
        if holdback_section_matches_sheet(section, sheet):
            matched.append(copy.deepcopy(section))
    return matched


def select_manual_settlement_rows_for_sheet(rows: list[dict], sheet: dict) -> list[dict]:
    matched = []
    for row in rows or []:
        if manual_settlement_row_matches_sheet(row, sheet):
            matched.append(copy.deepcopy(row))
    return matched


def summarize_holdback_sections(sections: list[dict]) -> dict:
    totals = {
        'ks2Amount': 0.0,
        'materialsUsed': 0.0,
        'advanceReceived': 0.0,
        'previousBalance': 0.0,
        'closingAmount': 0.0,
        'nextBalance': 0.0,
        'retentionAmount': 0.0,
        'payableAmount': 0.0,
    }
    for section in sections or []:
        for key in totals:
            totals[key] += safe_float(section.get(key), 0.0)
    return totals


def build_sheet_settlement_from_holdback_sections(sections: list[dict], manual_rows: list[dict] | None = None) -> dict:
    guarantee_total = 0.0
    advance_received_total = 0.0
    advance_previous_total = 0.0
    advance_close_total = 0.0
    advance_next_total = 0.0
    payable_total = 0.0
    guarantee_doc = {
        'name': 'Дополнительное соглашение о гарантийном удержании',
        'number': '',
        'date': None,
        'extra': 'Гарантийное удержание 3% от стоимости работ',
    }
    payment_rows = []
    auto_rows = []

    for section_index, section in enumerate(sections or [], start=1):
        section_name = first_non_empty(section.get('name'), default=f'Раздел {section_index}')
        retention_amount = safe_float(section.get('retentionAmount'), 0.0)
        section_amount = safe_float(section.get('ks2Amount'), 0.0)
        section_comment = first_non_empty(section.get('comment'), default='')
        closing_sum = 0.0

        if retention_amount > 0:
            guarantee_total += retention_amount
            if not guarantee_doc['number']:
                guarantee_doc['name'] = first_non_empty(section.get('retentionDocName'), guarantee_doc['name'])
                guarantee_doc['number'] = first_non_empty(section.get('retentionDocNumber'), default='')
                guarantee_doc['date'] = first_non_empty(section.get('retentionDocDate'))
                guarantee_doc['extra'] = first_non_empty(section.get('retentionDocExtra'), section_comment, guarantee_doc['extra'])

        for subitem in section.get('subitems', []) or []:
            advance_received = safe_float(subitem.get('advanceReceived'), 0.0)
            previous_balance = safe_float(subitem.get('previousBalance'), 0.0)
            closing_amount = safe_float(subitem.get('closingAmount'), 0.0)
            next_balance = safe_float(subitem.get('nextBalance'), 0.0)
            doc_ref = first_non_empty(subitem.get('advanceDoc'), default='')
            note = first_non_empty(subitem.get('comment'), default='')
            parsed_doc = parse_supporting_document_ref(doc_ref)
            doc_name = first_non_empty(subitem.get('advanceDocName'), default='Документ аванса')
            doc_number = first_non_empty(subitem.get('advanceDocNumber'), parsed_doc.get('documentNumber'))
            doc_date = first_non_empty(subitem.get('advanceDocDate'), parsed_doc.get('documentDate'))
            doc_extra = first_non_empty(subitem.get('advanceDocExtra'), parsed_doc.get('documentExtra'), note)
            has_payload = any([
                advance_received > 0,
                previous_balance > 0,
                closing_amount > 0,
                next_balance > 0,
                doc_ref,
                note,
            ])
            if not has_payload:
                continue

            advance_received_total += advance_received
            advance_previous_total += previous_balance
            advance_close_total += closing_amount
            advance_next_total += next_balance
            closing_sum += closing_amount
            payment_row = {
                'sectionNo': section_index,
                'paymentNo': len(payment_rows) + 1,
                'sectionName': section_name,
                'documentRef': doc_ref,
                'documentName': doc_name,
                'documentNumber': doc_number,
                'documentDate': doc_date,
                'documentExtra': doc_extra,
                'advanceReceived': advance_received,
                'previousBalance': previous_balance,
                'closingAmount': closing_amount,
                'nextBalance': next_balance,
                'comment': note,
            }
            payment_rows.append(payment_row)

            if closing_amount > 0:
                auto_rows.append({
                    'source': 'advance-close',
                    'kind': 'withhold',
                    'kindCode': '31',
                    'amount': round(closing_amount, 2),
                    'sectionName': section_name,
                    'paymentNo': payment_row['paymentNo'],
                    'documentRef': doc_ref,
                    'documentName': doc_name,
                    'documentNumber': doc_number,
                    'documentDate': doc_date,
                    'documentExtra': doc_extra,
                    'customKindText': '',
                    'comment': note,
                })

        section_payable = safe_float(section.get('payableAmount'), section_amount - retention_amount - closing_sum)
        payable_total += max(round(section_payable, 2), 0.0)

    if guarantee_total > 0:
        auto_rows.insert(0, {
            'source': 'guarantee-retention',
            'kind': 'withhold',
            'kindCode': '32',
            'amount': round(guarantee_total, 2),
            'documentRef': first_non_empty(guarantee_doc.get('number'), default=''),
            'documentName': guarantee_doc.get('name'),
            'documentNumber': first_non_empty(guarantee_doc.get('number')),
            'documentDate': guarantee_doc.get('date'),
            'documentExtra': guarantee_doc.get('extra'),
            'customKindText': '',
            'comment': guarantee_doc.get('extra') or '',
        })

    prepared_manual_rows = [copy.deepcopy(row) for row in (manual_rows or [])]
    active_manual_rows = [row for row in prepared_manual_rows if is_active_manual_settlement_row(row)]
    export_manual_rows = [row for row in active_manual_rows if safe_float(row.get('amount'), 0.0) > 0]

    settlement_rows = [
        *export_manual_rows,
        *auto_rows,
    ]
    total_retention = sum(
        safe_float(row.get('amount'), 0.0)
        for row in settlement_rows
        if normalize_settlement_kind(row.get('kind'), row.get('kindCode')) == 'withhold'
    )
    total_claims = sum(
        safe_float(row.get('amount'), 0.0)
        for row in settlement_rows
        if normalize_settlement_kind(row.get('kind'), row.get('kindCode')) == 'claim'
    )
    representative_manual_row = next((row for row in export_manual_rows if row.get('isPrimary')), None)
    representative_row = representative_manual_row or choose_preferred_settlement_row(settlement_rows, total_claims, total_retention)

    return {
        'totalRetention': round(total_retention, 2),
        'totalClaims': round(total_claims, 2),
        'totalGuaranteeRetention': round(guarantee_total, 2),
        'totalAdvanceClose': round(advance_close_total, 2),
        'totalAdvanceReceived': round(advance_received_total, 2),
        'totalAdvancePrevious': round(advance_previous_total, 2),
        'totalAdvanceNext': round(advance_next_total, 2),
        'totalPayable': round(payable_total, 2),
        'paymentRows': payment_rows,
        'settlementRows': settlement_rows,
        'autoRows': auto_rows,
        'manualRows': prepared_manual_rows,
        'representativeRow': representative_row,
    }


def resolve_settlement_payable_total(total_period_with_vat: float, settlement: dict | None) -> float:
    settlement = settlement or {}
    total_retention = safe_float(settlement.get('totalRetention'), 0.0)
    total_claims = safe_float(settlement.get('totalClaims'), 0.0)
    payable = round(safe_float(total_period_with_vat, 0.0) + total_claims - total_retention, 2)
    return max(payable, 0.0)


def build_ks3_totals_from_row(row: dict | None) -> dict:
    row = row or {}
    return {
        'fromStart': safe_float(row.get('fromStart'), 0.0),
        'fromYearStart': safe_float(row.get('fromYearStart'), 0.0),
        'forPeriod': safe_float(row.get('forPeriod'), 0.0),
        'vat': safe_float(row.get('vat'), 0.0),
    }


def build_settlement_info_blocks(holdback_sections: list[dict], sheet: dict | None) -> list[list[tuple[str, str | None]]]:
    if not holdback_sections:
        return []

    blocks: list[list[tuple[str, str | None]]] = []
    summary = build_sheet_settlement_from_holdback_sections(holdback_sections)
    guarantee_sections = [section for section in holdback_sections if safe_float(section.get('retentionAmount'), 0.0) > 0]

    blocks.append([
        ('AVANS_ROW_COUNT', str(len(summary.get('paymentRows', [])))),
        ('AVANS_TOTAL_RECEIVED_RUB', fmt_money(summary.get('totalAdvanceReceived'))),
        ('AVANS_TOTAL_PREVIOUS_BALANCE_RUB', fmt_money(summary.get('totalAdvancePrevious'))),
        ('AVANS_TOTAL_CLOSING_RUB', fmt_money(summary.get('totalAdvanceClose'))),
        ('AVANS_TOTAL_NEXT_BALANCE_RUB', fmt_money(summary.get('totalAdvanceNext'))),
        ('RET_GUARANTEE_ROW_COUNT', str(len(guarantee_sections))),
        ('RET_GUARANTEE_TOTAL_RUB', fmt_money(summary.get('totalGuaranteeRetention'))),
    ])

    for section_no, section in enumerate(guarantee_sections, start=1):
        blocks.append([
            ('RET_SECTION_NO', str(section_no)),
            ('RET_SECTION_NAME', first_non_empty(section.get('name'))),
            ('RET_BASE_RUB', fmt_money(section.get('ks2Amount'))),
            ('RET_RATE_PCT', fmt_money(section.get('retentionRate')).rstrip('0').rstrip('.')),
            ('RET_AMOUNT_RUB', fmt_money(section.get('retentionAmount'))),
            ('RET_DOC_NAME', first_non_empty(section.get('retentionDocName'))),
            ('RET_DOC_NO', first_non_empty(section.get('retentionDocNumber'))),
            ('RET_DOC_DATE', fmt_date(first_non_empty(section.get('retentionDocDate'))) if first_non_empty(section.get('retentionDocDate')) else None),
            ('RET_DOC_EXTRA', first_non_empty(section.get('retentionDocExtra'), section.get('comment'))),
        ])

    for row in summary.get('paymentRows', []):
        blocks.append([
            ('AVANS_ROW_NO', str(row.get('paymentNo') or '')),
            ('AVANS_SECTION', first_non_empty(row.get('sectionName'))),
            ('AVANS_DOC_REF', first_non_empty(row.get('documentRef'))),
            ('AVANS_DOC_NAME', first_non_empty(row.get('documentName'))),
            ('AVANS_DOC_NO', first_non_empty(row.get('documentNumber'))),
            ('AVANS_DOC_DATE', fmt_date(first_non_empty(row.get('documentDate'))) if first_non_empty(row.get('documentDate')) else None),
            ('AVANS_DOC_EXTRA', first_non_empty(row.get('documentExtra'))),
            ('AVANS_RECEIVED_RUB', fmt_money(row.get('advanceReceived'))),
            ('AVANS_PREVIOUS_BALANCE_RUB', fmt_money(row.get('previousBalance'))),
            ('AVANS_CLOSING_RUB', fmt_money(row.get('closingAmount'))),
            ('AVANS_NEXT_BALANCE_RUB', fmt_money(row.get('nextBalance'))),
            ('AVANS_NOTE', first_non_empty(row.get('comment'))),
        ])

    return blocks


def add_settlement_info_block(parent: ET._Element, pairs: list[tuple[str, str | None]]):
    normalized = []
    for key, value in pairs:
        prepared = first_non_empty(value)
        if prepared is None:
            continue
        normalized.append((str(key)[:50], str(prepared)[:2000]))
    if not normalized:
        return None
    block = ET.SubElement(parent, 'ИнфПолСвОРасч')
    for key, value in normalized:
        ET.SubElement(block, 'ТекстИнф', Идентиф=key, Значение=value)
    return block


def build_generated_file_id_for_sheet(generated: dict, manual: dict, sheet: dict) -> str:
    file_date = str(first_non_empty(generated.get('fileDate'), datetime.now().strftime('%Y-%m-%d')))
    contractor_inn = str(first_non_empty(manual.get('contractorInn'), default='0000000000000'))
    sheet_doc = sheet.get('document', {})
    raw_doc_number = str(first_non_empty(sheet_doc.get('number'), sheet.get('documentNumber'), default='1'))
    doc_number = re.sub(r'\D+', '', raw_doc_number) or re.sub(r'[^0-9A-Za-z]+', '', raw_doc_number) or '1'
    return f'ON_AKTREZRABP_0000000000000_{contractor_inn}_{file_date.replace('-', '')}_{doc_number.zfill(3)}'


def project_payload_to_single_ks2_sheet(data: dict, sheet_index: int) -> dict:
    binding_errors = [
        *collect_holdback_sheet_binding_errors(data),
        *collect_manual_settlement_sheet_binding_errors(data),
    ]
    if binding_errors:
        raise ValueError(json.dumps({'validationErrors': binding_errors}, ensure_ascii=False))

    ks2_sheets = data.get('ks2Sheets', []) or []
    if not (0 <= sheet_index < len(ks2_sheets)):
        raise IndexError(f'KS2 sheet index out of range: {sheet_index}')

    projected = copy.deepcopy(data)
    target_sheet = copy.deepcopy(ks2_sheets[sheet_index])
    target_sheet['sheetIndex'] = 0
    projected['ks2Sheets'] = [target_sheet]

    ks3 = projected.setdefault('ks3', {})
    target_sheet_doc = target_sheet.get('document', {}) or {}
    ks3['document'] = {
        **(ks3.get('document') or {}),
        'number': first_non_empty(target_sheet_doc.get('number'), target_sheet.get('documentNumber'), ks3.get('documentNumber')),
        'date': first_non_empty(target_sheet_doc.get('date'), target_sheet.get('documentDate'), ks3.get('documentDate')),
        'periodFrom': first_non_empty(target_sheet_doc.get('periodFrom'), target_sheet.get('periodFrom')),
        'periodTo': first_non_empty(target_sheet_doc.get('periodTo'), target_sheet.get('periodTo'), target_sheet_doc.get('date'), target_sheet.get('documentDate')),
    }
    ks3['documentNumber'] = first_non_empty(ks3['document'].get('number'), ks3.get('documentNumber'))
    ks3['documentDate'] = first_non_empty(ks3['document'].get('date'), ks3.get('documentDate'))
    ks3['periodFrom'] = first_non_empty(ks3['document'].get('periodFrom'), ks3.get('periodFrom'))
    ks3['periodTo'] = first_non_empty(ks3['document'].get('periodTo'), ks3.get('periodTo'))
    ks3['rows'] = []
    ks3['totals'] = {}

    holdbacks = projected.setdefault('holdbacks', {})
    original_sections = resolve_holdback_sections(data)
    filtered_sections = select_holdback_sections_for_sheet(original_sections, ks2_sheets[sheet_index])
    holdbacks['sections'] = filtered_sections
    holdbacks['totals'] = summarize_holdback_sections(filtered_sections)

    xml = resolve_xml_payload(projected)
    generated = xml.setdefault('generated', {})
    manual = xml.setdefault('manual', {})
    original_manual_rows = ((resolve_xml_payload(data).get('settlement', {}) or {}).get('manualRows') or [])
    filtered_manual_rows = select_manual_settlement_rows_for_sheet(original_manual_rows, ks2_sheets[sheet_index])
    xml['settlement'] = build_sheet_settlement_from_holdback_sections(filtered_sections, filtered_manual_rows)
    generated['fileId'] = build_generated_file_id_for_sheet(generated, manual, ks2_sheets[sheet_index])

    return projected


def build_xml_exports_by_ks2_sheet(data: dict):
    data = strip_redundant_single_sheet_bindings(data)
    ks2_sheets = data.get('ks2Sheets', []) or []
    if len(ks2_sheets) <= 1:
        tree = build_xml(copy.deepcopy(data))
        xml = resolve_xml_payload(data)
        generated = xml.get('generated', {}) if isinstance(xml, dict) else {}
        filename = f"{generated.get('fileId') or 'generated_1110335'}.xml"
        return [{
            'sheetIndex': 0,
            'sheetTitle': first_non_empty((ks2_sheets[0] if ks2_sheets else {}).get('title'), default='КС-2'),
            'filename': filename,
            'tree': tree,
        }]

    exports = []
    for sheet_index, sheet in enumerate(ks2_sheets):
        projected = project_payload_to_single_ks2_sheet(data, sheet_index)
        tree = build_xml(projected)
        xml = resolve_xml_payload(projected)
        generated = xml.get('generated', {}) if isinstance(xml, dict) else {}
        exports.append({
            'sheetIndex': sheet_index,
            'sheetTitle': first_non_empty(sheet.get('title'), default=f'КС-2 #{sheet_index + 1}'),
            'filename': f"{generated.get('fileId') or f'generated_1110335_{sheet_index + 1:02d}'}.xml",
            'tree': tree,
        })
    return exports


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
    common = resolve_document_context(data)
    xml = resolve_xml_payload(data)
    generated = xml.get('generated', {})
    manual = xml.get('manual', {})
    constants = xml.get('constants', {})
    settlement = copy.deepcopy(xml.get('settlement', {}) or {})
    sections = resolve_holdback_sections(data)
    holdbacks = {
        **copy.deepcopy(data.get('holdbacks', {}) or {}),
        'sections': sections,
    }
    if not holdbacks.get('totals') and sections:
        holdbacks['totals'] = summarize_holdback_sections(sections)
    manual_rows = settlement.get('manualRows') if isinstance(settlement.get('manualRows'), list) else []
    if not settlement.get('settlementRows') and (sections or manual_rows):
        settlement = build_sheet_settlement_from_holdback_sections(sections, manual_rows)
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
    ks2_totals = build_ks2_xml_totals(ks2_sheets)
    total_period_with_vat = round(ks2_totals.get('forPeriod', 0.0) + ks2_totals.get('vatForPeriod', 0.0), 2)
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
             ДатаДок=fmt_date(first_doc.get('date')),
             НаимОб=common.get('objectName') or common.get('constructionObject') or act.get('НаимОб'),
             КодОКВДог=currency_code)

    contract_id = act.find('ИдДог/ТипИдДок')
    set_attr(contract_id,
             НаимДок='Договор генподряда',
             НомерДок=common.get('contractNumber') or 'без номера',
             ДатаДок=fmt_date(common.get('contractDate')))

    estimate_container = act.find('ИдСмет')
    estimate = act.find('ИзмСмет')
    has_estimate_change = str(first_non_empty(manual.get('hasEstimateChange'), default='1')) == '1'
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
        НомерДок=(manual.get('estimateVersionCode') if has_estimate_change else first_non_empty(common.get('contractNumber'), default='1')) or '1',
        ДатаДок=fmt_date((manual.get('supplementDocDate') if has_estimate_change else first_non_empty(first_doc.get('date'), common.get('contractDate'))) or first_doc.get('date') or common.get('contractDate')),
    )

    correction = act.find('ИспрАктСдПр')
    is_correction_act = str(first_non_empty(manual.get('isCorrectionAct'), default='0')) == '1'
    if is_correction_act:
        set_attr(correction,
                 НомИспр=manual.get('correctionNumber') or correction.get('НомИспр') or '1',
                 ДатаИспр=fmt_date(manual.get('correctionDate') or first_doc.get('date')))
    elif correction is not None:
        act.remove(correction)

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
    if has_estimate_change:
        set_attr(estimate, КодСмет=manual.get('estimateVersionCode') or estimate.get('КодСмет') or '1')
        supplement = act.find('ИзмСмет/ИдДопСогл/ТипИдДок')
        set_attr(supplement,
                 НаимДок=manual.get('supplementDocType') or supplement.get('НаимДок') or 'Дополнительное соглашение',
                 НомерДок=manual.get('supplementDocNumber') or supplement.get('НомерДок') or 'ДС-1',
                 ДатаДок=fmt_date(manual.get('supplementDocDate') or supplement.get('ДатаДок')))
    elif estimate is not None:
        act.remove(estimate)

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

        export_items = all_items if all_items else []
        row_no = 1
        for sheet_index, sheet, item in export_items:
            sheet_doc = sheet.get('document', {})
            vat_rate = safe_float(first_non_empty(sheet_doc.get('vatRate'), sheet.get('vatRate'), first_doc.get('vatRate')), 20.0)
            amount_gross = resolve_row_amount(item)
            amount_parts = split_vat_inclusive_amount(amount_gross, vat_rate)
            price_parts = split_vat_inclusive_amount(item.get('price') or 0, vat_rate)
            attrs = {
                'НаимТов': item.get('name') or f'Работа {row_no}',
                'ЦенаТов': fmt_money(price_parts['base']),
                'СтТовБезНДС': fmt_money(amount_parts['base']),
                'НомСтр': str(row_no),
                'НомПоз': item.get('lineNo') or str(row_no),
                'ТипЗатр': resolve_expense_type(item),
                'ОКЕИ_Стройка': '796',
                'НаимЕдИзм': item.get('unit') or 'шт',
            }
            work_el = ET.SubElement(works, 'ВидРаб', **attrs)
            tax = ET.SubElement(work_el, 'СумНал')
            ET.SubElement(tax, 'СумНал').text = fmt_money(amount_parts['vat'])
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

        export_sections = sections if sections else []
        for idx, section in enumerate(export_sections, start=1):
            section_amount = float(section.get('ks2Amount') or 0)
            subitems = section.get('subitems', [])
            filtered_subitems = [sub for sub in subitems if float(sub.get('closingAmount') or 0) > 0 or float(sub.get('advanceReceived') or 0) > 0]
            if section_amount <= 0 and not filtered_subitems:
                continue
            section_parts = split_vat_inclusive_amount(section_amount, safe_float(first_non_empty(first_doc.get('vatRate'), 20), 20.0))
            sec = ET.SubElement(works, 'Раздел',
                                НаимРаздел=section.get('name') or f'Раздел №{idx}',
                                СтБезНДСРаздОтч=fmt_money(section_parts['base']))
            chosen_subitems = filtered_subitems[:1] if filtered_subitems else []
            if chosen_subitems:
                for sub in chosen_subitems:
                    row_amount = export_items[0][2].get('amount') if export_items else (sub.get('closingAmount') or sub.get('advanceReceived'))
                    row_parts = split_vat_inclusive_amount(row_amount, safe_float(first_non_empty(first_doc.get('vatRate'), 20), 20.0))
                    row_price = export_items[0][2].get('price') if export_items else (sub.get('advanceReceived') or row_amount)
                    row_price_parts = split_vat_inclusive_amount(row_price, safe_float(first_non_empty(first_doc.get('vatRate'), 20), 20.0))
                    ET.SubElement(sec, 'СвВидРаб',
                                  НаимТов=(export_items[0][2].get('name') if export_items else sub.get('advanceDoc') or f'Подпункт {idx}'),
                                  ЦенаТов=fmt_money(row_price_parts['base']),
                                  СтТовБезНДС=fmt_money(row_parts['base']))
            else:
                ET.SubElement(sec, 'СвВидРаб',
                              НаимТов=section.get('name') or f'Раздел №{idx}',
                              ЦенаТов=fmt_money(section_parts['base']),
                              СтТовБезНДС=fmt_money(section_parts['base']))
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
            sheet_metadata_attached = False
            for entry in sheet_sections:
                items = entry['items']
                if not items:
                    continue
                section_gross_raw = sum(resolve_effective_row_amount(item) for item in items)
                section_gross = max(round(section_gross_raw, 2), 0)
                section_estimate_no = entry.get('estimateNo') or next((str(it.get('estimateNo')) for it in items if it.get('estimateNo')), '')
                section_cumulative_gross_raw = sum(resolve_effective_cumulative_amount(item, resolve_effective_row_amount(item)) for item in items)
                section_cumulative_gross = max(round(section_cumulative_gross_raw, 2), 0)
                section_amount_parts = split_vat_inclusive_amount(section_gross, vat_rate_default)
                section_cumulative_parts = split_vat_inclusive_amount(section_cumulative_gross, vat_rate_default)
                section_amount = section_amount_parts['base']
                section_cumulative_amount = section_cumulative_parts['base']
                section_vat = section_amount_parts['vat']
                section_cumulative_vat = section_cumulative_parts['vat']
                sec_attrs = {
                    'НомСтр': str(entry['rowNo']),
                    'НомРазд': str(entry['sectionNo']),
                    'НаимРаздел': entry['name'],
                    'СтБезНДСРаздСмет': fmt_money(section_amount),
                    'СтСНДСРаздСмет': fmt_money(section_amount_parts['gross']),
                    'СтБезНДСРаздОтч': fmt_money(section_amount),
                    'СтСНДСРаздОтч': fmt_money(section_amount_parts['gross']),
                }
                if cumulative_mode == '1':
                    sec_attrs['СтБезНДСРаздСНач'] = fmt_money(section_cumulative_amount)
                    sec_attrs['СтСНДСРаздСНач'] = fmt_money(section_cumulative_parts['gross'])
                if section_estimate_no:
                    sec_attrs['ПозРаздСмет'] = section_estimate_no
                sec = ET.SubElement(works, 'Раздел', **sec_attrs)
                for item in items:
                    correction_kind = get_correction_kind(item)
                    correction_row = correction_kind is not None
                    amount_gross = resolve_row_amount(item)
                    effective_amount_gross = resolve_effective_row_amount(item)
                    price_parts = split_vat_inclusive_amount(item.get('price') or 0, vat_rate_default)
                    qty = resolve_row_quantity(item)
                    effective_qty = resolve_effective_row_quantity(item)
                    cumulative_gross = resolve_xml_cumulative_amount(item, amount_gross)
                    if cumulative_gross == amount_gross and len(items) == 1 and cumulative_mode == '1':
                        cumulative_gross = section_cumulative_parts['gross']
                    amount_parts = split_vat_inclusive_amount(amount_gross, vat_rate_default)
                    cumulative_parts = split_vat_inclusive_amount(cumulative_gross, vat_rate_default)
                    effective_amount_parts = split_vat_inclusive_amount(effective_amount_gross, vat_rate_default)
                    amount = amount_parts['base']
                    cumulative_amount = cumulative_parts['base']
                    effective_amount = effective_amount_parts['base']
                    if cumulative_amount == amount and len(items) == 1 and cumulative_mode == '1':
                        cumulative_amount = section_cumulative_amount
                    cumulative_qty = resolve_xml_cumulative_quantity(item, qty)
                    vat_amount = amount_parts['vat']
                    cumulative_vat_amount = cumulative_parts['vat']
                    item_attrs = {
                        'НомСтр': str(item.get('xmlRowNo')),
                        'НомПоз': str(item.get('lineNo') or item.get('xmlRowNo')),
                        'НаимТов': item.get('name') or f"Работа {item.get('xmlRowNo')}",
                        'ТипЗатр': resolve_expense_type(item),
                        'ЦенаТов': fmt_money(price_parts['base']),
                        'СтПоСметеБезНДС': fmt_money(amount),
                        'СтТовБезНДС': fmt_money(amount),
                        'СтТовУчНал': fmt_money(amount_parts['gross']),
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
                        ('ks2.expenseType', resolve_expense_type(item)),
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
                        ])
                        sheet_metadata_attached = True
                if not vat_in_total_only:
                    ET.SubElement(sec, 'СумНалРаздСмет').text = fmt_money(section_vat)
                    ET.SubElement(sec, 'СумНалРаздОтч').text = fmt_money(section_vat)
                    if cumulative_mode == '1':
                        ET.SubElement(sec, 'СумНалРаздСНач').text = fmt_money(section_cumulative_vat)

    transfer = doc.find('СвПродПер')
    clear_children(transfer)
    period_from, period_to = collect_document_periods(ks2_sheets)
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
    payable_total = resolve_settlement_payable_total(total_period_with_vat, settlement)
    set_attr(settlement_el,
             СумУдержВсегоОтч=fmt_money(settlement.get('totalRetention')),
             СумТребВсегоОтч=fmt_money(settlement.get('totalClaims')),
             ВсегоКОплатОтч=fmt_money(payable_total))
    settlement_rows = [row for row in settlement.get('settlementRows', []) if safe_float(row.get('amount') or 0, 0.0) > 0] or [{'amount': 1, 'kind': 'withhold', 'kindCode': '31'}]
    representative_row = settlement.get('representativeRow') or None
    aggregated_amount = sum(max(float(row.get('amount') or 0), 0) for row in settlement_rows)
    preferred_row = choose_preferred_settlement_row(settlement_rows, settlement.get('totalClaims'), settlement.get('totalRetention'), representative_row=representative_row) or {'kind': 'withhold', 'kindCode': '31'}
    preferred_kind = str(preferred_row.get('kindCode') or '31')
    preferred_branch = normalize_settlement_kind(preferred_row.get('kind'), preferred_kind)
    item = ET.SubElement(settlement_el, 'УчетТребУдерж', СумТребУдерж=fmt_money(aggregated_amount if aggregated_amount > 0 else 1))
    if preferred_branch == 'withhold':
        child = ET.SubElement(item, 'ВидУдерж')
        child.text = preferred_kind
        if preferred_kind == '36':
            other_text = first_non_empty(preferred_row.get('customKindText'), preferred_row.get('otherKindText'))
            if other_text:
                ET.SubElement(item, 'ИнВидУдерж').text = str(other_text)
    else:
        child = ET.SubElement(item, 'ВидТреб')
        child.text = preferred_kind
        if preferred_kind == '05':
            other_text = first_non_empty(preferred_row.get('customKindText'), preferred_row.get('otherKindText'))
            if other_text:
                ET.SubElement(item, 'ИнВидТреб').text = str(other_text)

    # Для текущего XSD-профиля УчетТребУдерж оставляем агрегированным,
    # но стараемся подставить самый информативный подтверждающий документ.
    supporting_row = preferred_row or next((row for row in settlement_rows if row), None)
    if supporting_row and not first_non_empty(supporting_row.get('documentRef'), supporting_row.get('documentNumber'), supporting_row.get('documentDate')):
        supporting_row = next((
            row for row in settlement_rows
            if first_non_empty(row.get('documentRef'), row.get('documentNumber'), row.get('documentDate'))
        ), supporting_row)
    if supporting_row:
        document_ref = str(first_non_empty(supporting_row.get('documentRef'), supporting_row.get('documentNumber')) or '').strip()
        doc_name = first_non_empty(supporting_row.get('documentName')) or ('Документ-основание удержания' if normalize_settlement_kind(supporting_row.get('kind'), supporting_row.get('kindCode')) == 'withhold' else 'Документ-основание требования')
        doc_number = first_non_empty(supporting_row.get('documentNumber'), document_ref, default='Без номера')
        doc_date = fmt_date(first_non_empty(supporting_row.get('documentDate'), common.get('contractDate')))
        doc_extra = first_non_empty(supporting_row.get('documentExtra'), supporting_row.get('comment'))
        m = re.search(r'^(.*?)\s+от\s+(\d{2}\.\d{2}\.\d{4})', document_ref)
        if m:
            doc_number = m.group(1).strip() or doc_number
            doc_date = m.group(2)
        doc_block = ET.SubElement(item, 'ДокПодтСумУд')
        doc_attrs = {'НаимДок': doc_name, 'НомерДок': doc_number, 'ДатаДок': doc_date}
        if doc_extra:
            doc_attrs['ДопСведДок'] = str(doc_extra)
        ET.SubElement(doc_block, 'ТипИдДок', **doc_attrs)

    settlement_info_blocks = build_settlement_info_blocks(holdbacks.get('sections', []), first_sheet)
    if settlement_info_blocks:
        for info_pairs in settlement_info_blocks:
            add_settlement_info_block(settlement_el, info_pairs)

    total_el = doc.find('ВсегоАктОтч')
    clear_children(total_el)
    total_base = first_number(ks2_totals.get('forPeriod'), default=0.0)
    vat_total = first_number(ks2_totals.get('vatForPeriod'), default=0.0)
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
        total_base_start = first_number(ks2_totals.get('fromStart'), total_base, default=total_base)
        vat_total_start = first_number(
            ks2_totals.get('vatFromStart'),
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

    if args.split_by_ks2:
        output_dir = Path(args.output_dir) if args.output_dir else output_path.parent / f'{input_path.stem}-per-ks2'
        output_dir.mkdir(parents=True, exist_ok=True)
        written = []
        for item in build_xml_exports_by_ks2_sheet(data):
            target = output_dir / item['filename']
            item['tree'].write(str(target), encoding='windows-1251', xml_declaration=True, pretty_print=True)
            written.append(target)
        print('\n'.join(str(path) for path in written))
        return

    if args.sheet_index is not None:
        zero_based_index = args.sheet_index - 1
        data = project_payload_to_single_ks2_sheet(data, zero_based_index)

    tree = build_xml(data)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tree.write(str(output_path), encoding='windows-1251', xml_declaration=True, pretty_print=True)
    print(output_path)


if __name__ == '__main__':
    main()
