#!/usr/bin/env python3
from __future__ import annotations

import argparse
import copy
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = ROOT / 'saved-forms' / 'split-single-sheet'


def first_non_empty(*values, default=None):
    for value in values:
        if value is None:
            continue
        if isinstance(value, str):
            value = value.strip()
            if not value:
                continue
            return value
        return value
    return default


def sanitize_name(value: str, default: str = 'form') -> str:
    text = re.sub(r'[^0-9A-Za-zА-Яа-я._-]+', '-', str(value or '').strip())
    text = re.sub(r'-{2,}', '-', text).strip('-')
    return text or default


def extract_state(payload: dict) -> dict:
    if isinstance(payload, dict) and isinstance(payload.get('state'), dict):
        return copy.deepcopy(payload['state'])
    if isinstance(payload, dict):
        return copy.deepcopy(payload)
    raise TypeError('Expected JSON object with state payload')


def build_source_sheets(state: dict) -> list[dict]:
    active = list(state.get('ks2Sheets') or [])
    legacy_extra = list(((state.get('legacy') or {}).get('extraKs2Sheets') or []))
    all_sheets = active + legacy_extra
    if not all_sheets:
        return []

    prepared = []
    for index, sheet in enumerate(all_sheets):
        prepared_sheet = copy.deepcopy(sheet)
        prepared_sheet['id'] = str(first_non_empty(prepared_sheet.get('id'), default=f'ks2-{index + 1}'))
        prepared_sheet['_sourceIndex'] = index
        prepared.append(prepared_sheet)
    return prepared


def resolve_sheet_id(row: dict) -> str | None:
    value = first_non_empty(row.get('ks2SheetId'), row.get('linkedKs2SheetId'), row.get('sheetId'))
    return str(value).strip() if value not in (None, '') else None


def resolve_sheet_index(row: dict):
    return first_non_empty(row.get('ks2SheetIndex'), row.get('linkedSheetIndex'))


def normalize_search_text(value) -> str:
    return ' '.join(str(value or '').lower().replace('ё', 'е').split())


def tokenize_search_text(value) -> list[str]:
    return [token for token in re.findall(r'[a-zа-я0-9]+', normalize_search_text(value)) if len(token) >= 6]


def build_legacy_sheet_match_score(text: str, sheet: dict) -> int:
    if not text:
        return 0
    score = 0
    document = sheet.get('document', {}) or {}
    title = normalize_search_text(first_non_empty(sheet.get('title'), default=''))
    basis = normalize_search_text(first_non_empty(document.get('basis'), sheet.get('basis'), default=''))
    doc_number = str(first_non_empty(document.get('number'), sheet.get('documentNumber'), default='')).strip()

    if doc_number:
        doc_patterns = [
            f'кс-2 №{doc_number}',
            f'кс2 №{doc_number}',
            f'акт №{doc_number}',
            f'акт n{doc_number}',
        ]
        if any(pattern in text for pattern in doc_patterns):
            score += 200
    if title and title in text:
        score += 50
    if basis and basis in text:
        score += 50
    for token in tokenize_search_text(title):
        if token in text:
            score += 10
    for token in tokenize_search_text(basis):
        if token in text:
            score += 10
    return score


def guess_sheet_for_row(row: dict, source_sheets: list[dict]) -> dict | None:
    text = normalize_search_text(' '.join([
        str(row.get('name') or ''),
        str(row.get('comment') or ''),
        str(row.get('advanceDoc') or ''),
        str(row.get('documentRef') or ''),
    ]))
    best = None
    for sheet in source_sheets:
        score = build_legacy_sheet_match_score(text, sheet)
        if not best or score > best['score']:
            best = {'sheet': sheet, 'score': score}
    return best['sheet'] if best and best['score'] > 0 else None


def row_matches_sheet(row: dict, sheet_id: str, source_index: int) -> bool:
    explicit_id = resolve_sheet_id(row)
    explicit_index = resolve_sheet_index(row)
    if explicit_id and explicit_id == str(sheet_id):
        return True
    if explicit_index not in (None, ''):
        try:
            return int(explicit_index) == int(source_index)
        except Exception:
            return False
    return False


def build_holdback_groups(rows: list[dict]) -> list[dict]:
    groups = []
    current = None
    for row in rows or []:
        kind = row.get('kind') or row.get('type') or 'section'
        if kind != 'subitem' or current is None:
            current = {'section': copy.deepcopy(row), 'subitems': []}
            groups.append(current)
            continue
        current['subitems'].append(copy.deepcopy(row))
    return groups


def flatten_holdback_groups(groups: list[dict]) -> list[dict]:
    rows = []
    for group in groups:
        rows.append(copy.deepcopy(group['section']))
        rows.extend(copy.deepcopy(group['subitems']))
    return rows


def build_holdback_source_rows(state: dict) -> list[dict]:
    holdbacks = state.get('holdbacks') or {}
    rows = holdbacks.get('rows') or []
    if rows:
        return copy.deepcopy(rows)

    prepared_rows = []
    for section in holdbacks.get('sections') or []:
        prepared_section = copy.deepcopy(section)
        nested_rows = prepared_section.pop('subitems', None)
        if nested_rows is None:
            nested_rows = prepared_section.pop('items', None)
        if nested_rows is None:
            nested_rows = prepared_section.pop('rows', None)
        prepared_section['kind'] = prepared_section.get('kind') or 'section'
        prepared_rows.append(prepared_section)
        for row in nested_rows or []:
            prepared_row = copy.deepcopy(row)
            prepared_row['kind'] = prepared_row.get('kind') or 'subitem'
            prepared_rows.append(prepared_row)
    return prepared_rows


def build_manual_settlement_source_rows(state: dict) -> list[dict]:
    xml_extras_rows = ((state.get('xmlExtras') or {}).get('settlementRows') or [])
    if xml_extras_rows:
        return copy.deepcopy(xml_extras_rows)

    collected = []
    seen = set()
    for bucket_name in ['xmlP', 'xml']:
        settlement = ((state.get(bucket_name) or {}).get('settlement') or {})
        for row in settlement.get('manualRows') or []:
            key = json.dumps(row, ensure_ascii=False, sort_keys=True)
            if key in seen:
                continue
            seen.add(key)
            collected.append(copy.deepcopy(row))
    return collected


def split_holdback_groups(groups: list[dict], source_sheets: list[dict]):
    matched = {sheet['id']: [] for sheet in source_sheets}
    unassigned = []
    for group in groups:
        matched_sheet = next((sheet for sheet in source_sheets if row_matches_sheet(group['section'], sheet['id'], sheet['_sourceIndex'])), None)
        if matched_sheet is None:
            matched_sheet = guess_sheet_for_row(group['section'], source_sheets)
        if matched_sheet is None:
            unassigned.append(group)
            continue
        section = copy.deepcopy(group['section'])
        section['ks2SheetId'] = matched_sheet['id']
        subitems = []
        for subitem in group['subitems']:
            prepared_subitem = copy.deepcopy(subitem)
            prepared_subitem['ks2SheetId'] = matched_sheet['id']
            subitems.append(prepared_subitem)
        matched[matched_sheet['id']].append({'section': section, 'subitems': subitems})
    return matched, unassigned


def split_manual_settlement_rows(rows: list[dict], source_sheets: list[dict]):
    matched = {sheet['id']: [] for sheet in source_sheets}
    unassigned = []
    for row in rows or []:
        matched_sheet = next((sheet for sheet in source_sheets if row_matches_sheet(row, sheet['id'], sheet['_sourceIndex'])), None)
        if matched_sheet is None:
            matched_sheet = guess_sheet_for_row(row, source_sheets)
        if matched_sheet is None:
            unassigned.append(copy.deepcopy(row))
            continue
        prepared_row = copy.deepcopy(row)
        prepared_row['ks2SheetId'] = matched_sheet['id']
        matched[matched_sheet['id']].append(prepared_row)
    return matched, unassigned


def build_single_sheet_state(base_state: dict, target_sheet: dict, source_sheets: list[dict], holdback_groups_by_sheet: dict, unassigned_holdback_groups: list[dict], settlement_rows_by_sheet: dict, unassigned_settlement_rows: list[dict], output_index: int) -> dict:
    state = copy.deepcopy(base_state)
    target_sheet_id = target_sheet['id']

    state['ks2Sheets'] = [copy.deepcopy({k: v for k, v in target_sheet.items() if not k.startswith('_')})]
    state.setdefault('ks3', {})
    state['ks3']['rows'] = []
    state.setdefault('legacy', {})
    state['legacy']['extraKs2Sheets'] = []
    state['legacy']['splitSourceSheetCount'] = len(source_sheets)
    state['legacy']['splitSourceSheetIndex'] = target_sheet['_sourceIndex']
    state['legacy']['splitSourceSheetTitle'] = first_non_empty(target_sheet.get('title'), default=f'КС-2 #{target_sheet["_sourceIndex"] + 1}')
    state['legacy']['splitSourceSheetId'] = target_sheet_id
    state['legacy']['unassignedHoldbackRows'] = flatten_holdback_groups(unassigned_holdback_groups) if output_index == 0 else []
    state['legacy']['unassignedSettlementRows'] = copy.deepcopy(unassigned_settlement_rows) if output_index == 0 else []

    state.setdefault('holdbacks', {})
    state['holdbacks']['rows'] = flatten_holdback_groups(holdback_groups_by_sheet.get(target_sheet_id, []))

    state.setdefault('xmlExtras', {})
    settlement_rows = settlement_rows_by_sheet.get(target_sheet_id, [])
    state['xmlExtras']['settlementRows'] = settlement_rows

    state.setdefault('ui', {})
    state['ui']['activePane'] = 'ks2:0'
    state['ui']['ks2ViewMode'] = {}
    state['ui']['ks2XmlPreview'] = {}
    state['ui']['ks2CustomerXmlPreview'] = {}
    state['ui']['singleSheetModeNotice'] = 'Форма создана splitter-скриптом из legacy multi-sheet JSON.'

    state.setdefault('meta', {})
    state['meta']['splitFromMultiSheet'] = True
    state['meta']['splitSourceSheetIndex'] = target_sheet['_sourceIndex']
    state['meta']['splitSourceSheetTitle'] = state['legacy']['splitSourceSheetTitle']

    return state


def build_split_form_items(payload: dict) -> list[dict]:
    state = extract_state(payload)
    source_sheets = build_source_sheets(state)
    if not source_sheets:
        raise ValueError('No KS-2 sheets found in state')

    holdback_groups = build_holdback_groups(build_holdback_source_rows(state))
    manual_rows = build_manual_settlement_source_rows(state)
    holdback_groups_by_sheet, unassigned_holdback_groups = split_holdback_groups(holdback_groups, source_sheets)
    settlement_rows_by_sheet, unassigned_settlement_rows = split_manual_settlement_rows(manual_rows, source_sheets)

    outputs = []
    for output_index, sheet in enumerate(source_sheets):
        single_state = build_single_sheet_state(
            state,
            sheet,
            source_sheets,
            holdback_groups_by_sheet,
            unassigned_holdback_groups,
            settlement_rows_by_sheet,
            unassigned_settlement_rows,
            output_index,
        )
        title = first_non_empty(sheet.get('title'), default=f'КС-2 #{sheet["_sourceIndex"] + 1}')
        doc = sheet.get('document', {}) or {}
        doc_number = first_non_empty(doc.get('number'), sheet.get('documentNumber'), default=str(sheet['_sourceIndex'] + 1))
        outputs.append({
            'sheetIndex': sheet['_sourceIndex'],
            'sheetId': sheet['id'],
            'sheetTitle': title,
            'documentNumber': doc_number,
            'state': single_state,
        })
    return outputs


def save_split_forms(forms: list[dict], output_dir: Path, base_name: str) -> list[dict]:
    output_dir.mkdir(parents=True, exist_ok=True)
    saved = []
    for item in forms:
        filename = f"{sanitize_name(base_name)}--ks2-{item['sheetIndex'] + 1:02d}--doc-{sanitize_name(item['documentNumber'], 'no-number')}--{sanitize_name(item['sheetTitle'], 'sheet')}.json"
        path = output_dir / filename
        path.write_text(json.dumps(item['state'], ensure_ascii=False, indent=2), encoding='utf-8')
        saved.append({
            'sheetIndex': item['sheetIndex'],
            'sheetTitle': item['sheetTitle'],
            'documentNumber': item['documentNumber'],
            'path': str(path),
            'filename': filename,
        })
    return saved


def main():
    parser = argparse.ArgumentParser(description='Split a legacy multi-sheet KC2-KC3-XML form into single-sheet forms.')
    parser.add_argument('input_json', help='Path to source JSON (state payload or object with {state: ...})')
    parser.add_argument('-o', '--output-dir', default=str(DEFAULT_OUTPUT_DIR), help='Directory for generated single-sheet JSON files')
    parser.add_argument('--base-name', default=None, help='Base name for generated files')
    args = parser.parse_args()

    input_path = Path(args.input_json).resolve()
    payload = json.loads(input_path.read_text(encoding='utf-8'))
    forms = build_split_form_items(payload)
    base_name = args.base_name or input_path.stem
    saved = save_split_forms(forms, Path(args.output_dir).resolve(), base_name)
    print(json.dumps({'ok': True, 'count': len(saved), 'items': saved}, ensure_ascii=False, indent=2))


def _strip_redundant_single_sheet_bindings(forms):
    cleaned = []
    for form in forms:
        form_copy = copy.deepcopy(form)
        if len(form_copy.get('ks2Sheets') or []) == 1:
            for section in ((form_copy.get('holdbacks') or {}).get('sections') or []):
                section.pop('ks2SheetId', None)
            for bucket_name in ['xmlP', 'xml']:
                bucket = form_copy.get(bucket_name) or {}
                settlement = bucket.get('settlement') or {}
                for row in settlement.get('manualRows') or []:
                    row.pop('ks2SheetId', None)
        cleaned.append(form_copy)
    return cleaned


def split_state_into_single_sheet_forms(state):
    items = build_split_form_items(state)
    return _strip_redundant_single_sheet_bindings([item['state'] for item in items])


if __name__ == '__main__':
    main()
