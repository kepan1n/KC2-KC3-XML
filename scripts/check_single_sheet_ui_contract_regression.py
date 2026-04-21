#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_JS = ROOT / 'variants' / 'modern-light' / 'app.js'
INDEX_HTML = ROOT / 'variants' / 'modern-light' / 'index.html'
SAMPLE_JSON = ROOT / 'variants' / 'modern-light' / 'data' / 'sample-data.json'


def require_contains(text: str, needle: str, label: str):
    if needle not in text:
        raise AssertionError(f'{label}: expected to find {needle!r}')


def require_absent(text: str, needle: str, label: str):
    if needle in text:
        raise AssertionError(f'{label}: unexpected legacy fragment {needle!r}')


def main():
    app_js = APP_JS.read_text(encoding='utf-8')
    index_html = INDEX_HTML.read_text(encoding='utf-8')
    sample = json.loads(SAMPLE_JSON.read_text(encoding='utf-8'))
    description = ((sample.get('meta') or {}).get('description') or '').strip()
    ks2_sheets = sample.get('ks2Sheets') or []
    legacy_extra = ((sample.get('legacy') or {}).get('extraKs2Sheets') or [])
    ks3_rows = (((sample.get('ks3') or {}).get('rows')) or [])

    # Top-level UI wording should stay aligned with the current product contract.
    require_contains(index_html, '<title>KC2 XML — Modern Light</title>', 'index.html')
    require_contains(index_html, '<h1>KC2 XML — современная светлая форма</h1>', 'index.html')
    require_contains(index_html, 'Single-sheet интерфейс', 'index.html')
    require_contains(index_html, 'P + Z', 'index.html')
    require_absent(index_html, 'KC2 / KC3 / XML', 'index.html')

    # The active modern-light flow should not expose dead multi-sheet / KS-3 handlers.
    for forbidden in [
        "refs.addSheet?.addEventListener",
        "action === 'add-ks3-row'",
        "action === 'toggle-ks3-row-menu'",
        "action === 'insert-ks3-row-after'",
        "action === 'prompt-delete-ks3-row'",
        "action === 'confirm-delete-ks3-row'",
        'function normalizeKs3Row(',
        'function createBlankKs3Row(',
        'function buildKs3Rows(',
        'function buildKs3Totals(',
        'data.ks3.title ||= `КС-3 №',
        "'documentContext.okudKs3'",
        "'documentContext.ks3DocLabel'",
        "'documentContext.ks3DocSubtitle'",
        "'documentContext.ks3DeveloperPosition'",
        "'documentContext.ks3DeveloperName'",
        "'documentContext.ks3TechCustomerPosition'",
        "'documentContext.ks3TechCustomerName'",
        "'documentContext.ks3ContractorPosition'",
        "'documentContext.ks3ContractorName'",
        "'ks3.documentNumber'",
        "'ks3.documentDate'",
        "'ks3.periodFrom'",
        "'ks3.periodTo'",
        "'ks3.totals.fromStart'",
        "'ks3.totals.fromYearStart'",
        "'ks3.totals.forPeriod'",
        "'ks3.totals.vat'",
        'Ручные строки КС-3 напрямую не выгружаются в P XML',
        'Для multi-KS2 у каждой строки удержаний нужен явный лист КС-2.',
        'Для multi-KS2 ручную строку ВидТреб / ВидУдерж нужно явно привязать к листу КС-2.',
    ]:
        require_absent(app_js, forbidden, 'variants/modern-light/app.js')

    # Customer readiness should no longer prefer KS-3-derived signer fallbacks.
    for forbidden in [
        'common.ks3DeveloperName',
        'common.ks3DeveloperPosition',
        'common.ks3TechCustomerName',
        'common.ks3TechCustomerPosition',
        'common.ks3TechCustomerOrgName',
        'common.ks3DeveloperOrgName',
    ]:
        require_absent(app_js, forbidden, 'variants/modern-light/app.js')

    # Positive anchors for the current contract.
    require_contains(app_js, 'Редактор работает только с одним листом КС-2', 'variants/modern-light/app.js')
    require_contains(app_js, 'legacy.extraKs2Sheets', 'variants/modern-light/app.js')
    require_contains(app_js, 'Разложить legacy-листы в отдельные single-sheet JSON', 'variants/modern-light/app.js')
    require_contains(app_js, "import { buildCustomerXmlReadiness } from './customer-readiness.js';", 'variants/modern-light/app.js')
    require_contains(app_js, 'Z readiness-check', 'variants/modern-light/app.js')
    require_contains(app_js, 'fallback-значениях', 'variants/modern-light/app.js')
    require_contains(app_js, 'toggle-customer-readiness-blocking', 'variants/modern-light/app.js')
    require_contains(app_js, 'toggle-holdbacks-xml-export', 'variants/modern-light/app.js')
    require_contains(app_js, 'Blocking mode Z', 'variants/modern-light/app.js')
    require_contains(app_js, "{ pane: 'holdbacks', label: 'Удержания' }", 'variants/modern-light/app.js')
    require_contains(app_js, 'Удержания вынесены в отдельную вкладку', 'variants/modern-light/app.js')
    require_contains(app_js, 'Удержания текущего листа КС-2', 'variants/modern-light/app.js')
    require_contains(app_js, 'Удержания в XML: вкл', 'variants/modern-light/app.js')
    require_contains(app_js, 'Передача удержаний в XML отключена', 'variants/modern-light/app.js')
    require_contains(app_js, 'Экспорт P + Z остановлен', 'variants/modern-light/app.js')
    require_contains(app_js, 'СоглСтрДопИнф', 'variants/modern-light/app.js')
    require_contains(app_js, 'xmlP: сдача работ / СвПродПер', 'variants/modern-light/app.js')
    require_contains(app_js, 'Дата предъявления результатов заказчику', 'variants/modern-light/app.js')
    require_contains(app_js, 'Документ предъявления — наименование', 'variants/modern-light/app.js')
    require_contains(app_js, 'Срок принятия — рабочие дни', 'variants/modern-light/app.js')
    require_contains(app_js, 'Сообщение о готовности — наименование', 'variants/modern-light/app.js')
    require_contains(app_js, 'Статусы возле полей теперь показывают тип связи с XML', 'variants/modern-light/app.js')
    require_contains(app_js, 'function renderXmlBindingLegend()', 'variants/modern-light/app.js')
    require_contains(app_js, "return compact ? 'C' : 'core';", 'variants/modern-light/app.js')
    require_contains(app_js, "return compact ? 'I' : 'ИнфПол';", 'variants/modern-light/app.js')
    require_contains(app_js, "return compact ? '—' : 'UI-only';", 'variants/modern-light/app.js')
    require_contains(app_js, 'data-action="jump-to-source-field"', 'variants/modern-light/app.js')
    require_contains(app_js, '>К полю</button>', 'variants/modern-light/app.js')
    require_contains(app_js, '>XML</button>', 'variants/modern-light/app.js')
    require_contains(app_js, 'Срок: рабочие дни', 'variants/modern-light/app.js')
    require_contains(app_js, 'Режим срока принятия переключён', 'variants/modern-light/app.js')
    require_contains(app_js, 'Z XSD compat', 'variants/modern-light/app.js')
    require_contains(app_js, 'validation-only', 'variants/modern-light/app.js')
    require_contains(app_js, 'Текущая non-gov модель ролей такая', 'variants/modern-light/app.js')
    require_contains(app_js, 'По подписантам сейчас логика такая', 'variants/modern-light/app.js')
    require_contains(app_js, 'По умолчанию составителем Z-файла и основной стороной customer XML сейчас считается технический заказчик', 'variants/modern-light/app.js')
    require_contains(app_js, 'const documentContext = model.documentContext || {};', 'variants/modern-light/app.js')
    require_contains(app_js, 'const settlementModel = model.xmlExtras?.settlement || {};', 'variants/modern-light/app.js')
    require_contains(app_js, 'const manualSettlementRows = settlementModel.manualRows || model.xmlExtras?.settlementRows || [];', 'variants/modern-light/app.js')
    require_contains(app_js, 'const xmlManual = model.xmlP?.manual || {};', 'variants/modern-light/app.js')
    require_contains(app_js, 'settlement: clone(holdbacksXml),', 'variants/modern-light/app.js')
    require_contains(app_js, 'includeInXml: includeHoldbacksInXml,', 'variants/modern-light/app.js')
    require_contains(app_js, 'function shouldIncludeHoldbacksInXml(source = app.state)', 'variants/modern-light/app.js')
    require_contains(app_js, 'documentContext: clone(app.state.documentContext),', 'variants/modern-light/app.js')
    require_contains(app_js, 'Подсказки справа коротко объясняют, зачем нужен узел XML', 'variants/modern-light/app.js')
    require_contains(app_js, 'function renderXmlPreviewLegend()', 'variants/modern-light/app.js')
    require_contains(app_js, 'function renderXmlPreviewCode(xmlText = \'\', scope = \'p\', sheetIndex = 0, emptyMessage = \'Preview ещё не собран.\')', 'variants/modern-light/app.js')
    require_contains(app_js, 'function renderKs2RowActions(sheetIndex, rowIndex)', 'variants/modern-light/app.js')
    require_contains(app_js, 'Добавление строк теперь открывается через кнопку <strong>+</strong> у нужной строки', 'variants/modern-light/app.js')
    require_contains(app_js, 'title: \'XSD-ready строка расчётов\'', 'variants/modern-light/app.js')
    require_absent(app_js, 'const documentContext = model.documentContext || model.common || {};', 'variants/modern-light/app.js')
    require_absent(app_js, 'const manualSettlementRows = model.xmlExtras?.settlementRows || model.xml?.settlement?.manualRows || [];', 'variants/modern-light/app.js')
    require_absent(app_js, 'const common = model.common;', 'variants/modern-light/app.js')
    require_absent(app_js, 'const manual = model.xml.manual;', 'variants/modern-light/app.js')
    require_absent(app_js, 'const generated = model.xml.generated;', 'variants/modern-light/app.js')
    require_absent(app_js, 'const constants = model.xml.constants;', 'variants/modern-light/app.js')
    require_absent(app_js, 'const traceableGoods = model.xml.traceableGoods || [];', 'variants/modern-light/app.js')
    require_absent(app_js, 'const manual = model.xmlP?.manual || model.xml?.manual || {};', 'variants/modern-light/app.js')
    require_absent(app_js, 'const representativeRow = model.xml?.settlement?.representativeRow || null;', 'variants/modern-light/app.js')
    require_absent(app_js, 'const xmlSettlementRows = model.xml?.settlement?.settlementRows || [];', 'variants/modern-light/app.js')
    require_absent(app_js, 'const generated = model.xmlP?.generated || model.xml?.generated || {};', 'variants/modern-light/app.js')
    require_absent(app_js, 'const traceableGoods = model.xmlP?.traceableGoods || model.xmlExtras?.traceableGoods || model.xml?.traceableGoods || [];', 'variants/modern-light/app.js')
    require_absent(app_js, 'common: clone(app.state.documentContext),', 'variants/modern-light/app.js')
    require_absent(app_js, '    xml: {', 'variants/modern-light/app.js')
    require_absent(app_js, 'renderKs2SheetAddMenu(sheetIndex)', 'variants/modern-light/app.js')
    require_absent(app_js, 'button class="mini secondary" data-action="add-section-row"', 'variants/modern-light/app.js')
    require_absent(app_js, 'button class="mini secondary" data-action="add-note-row"', 'variants/modern-light/app.js')
    require_absent(app_js, 'function buildXmlExportString(model)', 'variants/modern-light/app.js')
    require_absent(app_js, 'model.ks3.totals?.forPeriod', 'variants/modern-light/app.js')

    require_contains(description, 'Single-sheet sample', 'sample-data.json')
    require_contains(description, 'P + Z', 'sample-data.json')
    require_absent(description, 'ручной лист КС-3', 'sample-data.json')
    if len(ks2_sheets) != 1:
        raise AssertionError(f'sample-data.json: expected exactly 1 active ks2 sheet, got {len(ks2_sheets)}')
    if legacy_extra:
        raise AssertionError(f'sample-data.json: expected no extra legacy ks2 sheets in active sample, got {len(legacy_extra)}')
    if ks3_rows:
        raise AssertionError(f'sample-data.json: expected no active KS-3 rows in modern-light sample, got {len(ks3_rows)}')

    print('OK: single-sheet modern-light UI contract regression passed')


if __name__ == '__main__':
    main()
