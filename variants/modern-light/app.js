const STORAGE_KEY = 'kc2kc3-web-form-v1';

const refs = {
  appShell: document.getElementById('app-shell'),
  sidebar: document.getElementById('sidebar'),
  content: document.getElementById('content'),
  stats: document.getElementById('stats'),
  flash: document.getElementById('flash'),
  loadSample: document.getElementById('load-sample'),
  saveLocal: document.getElementById('save-local'),
  exportJson: document.getElementById('export-json'),
  addSheet: document.getElementById('add-ks2-sheet'),
  scaleDown: document.getElementById('scale-down'),
  scaleReset: document.getElementById('scale-reset'),
  scaleUp: document.getElementById('scale-up'),
  densityCompact: document.getElementById('density-compact'),
};

const SCALE_STEPS = [85, 100, 115];

const app = {
  sample: null,
  state: null,
};

boot();

async function boot() {
  app.sample = prepareState(await fetchSample());
  const saved = loadSavedState();
  app.state = saved ? prepareState(saved) : clone(app.sample);
  bindGlobalEvents();
  render();
}

async function fetchSample() {
  const response = await fetch('./data/sample-data.json');
  if (!response.ok) throw new Error('Не удалось загрузить sample-data.json');
  return response.json();
}

function bindGlobalEvents() {
  refs.loadSample.addEventListener('click', () => {
    const ui = clone(app.state?.ui || {});
    app.state = clone(app.sample);
    app.state.ui = { ...app.state.ui, ...ui };
    render();
    flash('Загружен пример из Excel.');
  });

  refs.saveLocal.addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(app.state));
    flash('Форма сохранена в localStorage браузера.');
  });

  refs.exportJson.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(app.state, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kc2-kc3-form-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    flash('JSON выгружен.');
  });

  refs.addSheet.addEventListener('click', () => {
    app.state.ks2Sheets.push(createBlankSheet(app.state.ks2Sheets.length + 1));
    app.state.ui.activePane = `ks2:${app.state.ks2Sheets.length - 1}`;
    render();
    flash('Добавлен новый лист КС-2.');
  });

  refs.scaleDown?.addEventListener('click', () => shiftScale(-1));
  refs.scaleUp?.addEventListener('click', () => shiftScale(1));
  refs.scaleReset?.addEventListener('click', () => {
    app.state.ui.scale = 100;
    render();
  });
  refs.densityCompact?.addEventListener('change', (event) => {
    app.state.ui.compactRows = event.target.checked;
    render();
  });

  refs.sidebar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-pane]');
    if (!button) return;
    app.state.ui.activePane = button.dataset.pane;
    render();
  });

  refs.content.addEventListener('click', handleContentClick);
  refs.content.addEventListener('change', handleContentChange);
}

function handleContentClick(event) {
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  const { action, sheetIndex, rowIndex, holdIndex, traceIndex } = actionButton.dataset;

  if (action === 'add-item-row') {
    app.state.ks2Sheets[Number(sheetIndex)].rows.push(createBlankRow('item'));
    render();
    return;
  }

  if (action === 'add-section-row') {
    app.state.ks2Sheets[Number(sheetIndex)].rows.push(createBlankRow('section'));
    render();
    return;
  }

  if (action === 'add-note-row') {
    app.state.ks2Sheets[Number(sheetIndex)].rows.push(createBlankRow('note'));
    render();
    return;
  }

  if (action === 'delete-row') {
    app.state.ks2Sheets[Number(sheetIndex)].rows.splice(Number(rowIndex), 1);
    render();
    return;
  }

  if (action === 'duplicate-sheet') {
    const sheet = clone(app.state.ks2Sheets[Number(sheetIndex)]);
    sheet.id = `ks2-${Date.now()}`;
    sheet.title = `${sheet.title} (копия)`;
    app.state.ks2Sheets.splice(Number(sheetIndex) + 1, 0, sheet);
    render();
    flash('Лист КС-2 дублирован.');
    return;
  }

  if (action === 'delete-sheet') {
    if (app.state.ks2Sheets.length === 1) {
      flash('Нужно оставить хотя бы один лист КС-2.');
      return;
    }
    app.state.ks2Sheets.splice(Number(sheetIndex), 1);
    app.state.ui.activePane = 'requisites';
    render();
    flash('Лист КС-2 удалён.');
    return;
  }

  if (action === 'add-holdback-row') {
    app.state.holdbacks.rows.push(createBlankHoldbackRow());
    render();
    return;
  }

  if (action === 'delete-holdback-row') {
    app.state.holdbacks.rows.splice(Number(holdIndex), 1);
    render();
    return;
  }

  if (action === 'add-trace-row') {
    app.state.xmlExtras.traceableGoods.push({ registrationNumber: '', unitCode: '', unitName: '', quantity: null });
    render();
    return;
  }

  if (action === 'delete-trace-row') {
    app.state.xmlExtras.traceableGoods.splice(Number(traceIndex), 1);
    render();
    return;
  }
}

function handleContentChange(event) {
  const field = event.target.closest('[data-path]');
  if (!field) return;
  const { path, valueType = 'string' } = field.dataset;
  setByPath(app.state, path, coerceValue(field.value, valueType));
  app.state = prepareState(app.state);
  render();
}

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function prepareState(raw) {
  const data = clone(raw);
  data.ui ??= {};
  data.ui.activePane ??= 'requisites';
  data.ui.scale = normalizeScale(data.ui.scale ?? 100);
  data.ui.compactRows = data.ui.compactRows ?? true;
  data.common ??= {};
  data.holdbacks ??= { rows: [] };
  data.holdbacks.rows ??= [];
  data.xmlExtras ??= {};
  data.xmlExtras.generated ??= {};
  data.xmlExtras.constants ??= {};
  data.xmlExtras.manual ??= {};
  data.xmlExtras.traceableGoods ??= [];

  data.common.okudKs3 = data.common.okudKs3 && data.common.okudKs3 !== 'Форма по ОКУД' ? data.common.okudKs3 : '0322001';

  data.ks2Sheets = (data.ks2Sheets || []).map((sheet, index) => {
    const prepared = {
      ...sheet,
      id: sheet.id || `ks2-${index + 1}`,
      rows: (sheet.rows || []).map((row) => ({
        ...row,
        type: row.type || 'item',
        code: row.code ?? '',
        lineNo: row.lineNo ?? '',
        estimateNo: row.estimateNo ?? '',
        name: row.name ?? '',
        unit: row.unit ?? '',
        quantity: numberOrNull(row.quantity),
        price: numberOrNull(row.price),
        amount: numberOrNull(row.amount),
        unitConsumption: numberOrNull(row.unitConsumption),
        note: row.note ?? '',
        category: row.category || inferCategory(row.name || '', row.note || ''),
      })),
    };

    prepared.rows.forEach((row) => {
      row.amount = computeRowAmount(row);
    });

    return prepared;
  });

  data.holdbacks.rows = (data.holdbacks.rows || []).map((row) => {
    const ks2Amount = numberOrZero(row.ks2Amount);
    const retentionAmount = numberOrZero(row.retentionAmount);
    const retentionRate = row.retentionRate ?? (ks2Amount ? round2((retentionAmount / ks2Amount) * 100) : 3);
    return {
      ...row,
      name: row.name ?? '',
      advanceDoc: row.advanceDoc ?? '',
      comment: row.comment ?? '',
      ks2Amount: numberOrNull(row.ks2Amount),
      materialsUsed: numberOrNull(row.materialsUsed),
      advanceReceived: numberOrNull(row.advanceReceived),
      previousBalance: numberOrNull(row.previousBalance),
      closingAmount: numberOrNull(row.closingAmount),
      nextBalance: numberOrNull(row.nextBalance),
      retentionAmount: numberOrNull(row.retentionAmount),
      payableAmount: numberOrNull(row.payableAmount),
      retentionRate: numberOrNull(retentionRate),
    };
  });

  data.xmlExtras.generated.programVersion ||= 'prototype-0.1.0';

  return data;
}

function render() {
  applyUiPreferences();
  renderSidebar();
  renderStats();
  renderContent();
}

function applyUiPreferences() {
  document.body.dataset.scale = String(normalizeScale(app.state.ui.scale));
  document.body.dataset.density = app.state.ui.compactRows ? 'compact' : 'comfortable';

  if (refs.scaleReset) refs.scaleReset.textContent = `${normalizeScale(app.state.ui.scale)}%`;
  if (refs.densityCompact) refs.densityCompact.checked = Boolean(app.state.ui.compactRows);
}

function shiftScale(direction) {
  const current = normalizeScale(app.state.ui.scale);
  const index = SCALE_STEPS.indexOf(current);
  const safeIndex = index === -1 ? 1 : index;
  const nextIndex = Math.min(Math.max(safeIndex + direction, 0), SCALE_STEPS.length - 1);
  app.state.ui.scale = SCALE_STEPS[nextIndex];
  render();
}

function normalizeScale(value) {
  const numeric = Number(value);
  return SCALE_STEPS.includes(numeric) ? numeric : 100;
}

function renderSidebar() {
  const active = app.state.ui.activePane;
  const ks2Buttons = app.state.ks2Sheets.map((sheet, index) => {
    const totals = computeSheetTotals(sheet);
    return `
      <button class="nav-button ${active === `ks2:${index}` ? 'active' : ''}" data-pane="ks2:${index}">
        ${escapeHtml(sheet.title || `Лист КС-2 #${index + 1}`)}
        <span class="nav-meta">${formatMoney(totals.gross)} · строк: ${sheet.rows.length}</span>
      </button>
    `;
  }).join('');

  refs.sidebar.innerHTML = `
    <div class="nav-section">
      <p class="nav-title">Основное</p>
      <div class="nav-list">
        <button class="nav-button ${active === 'requisites' ? 'active' : ''}" data-pane="requisites">
          Реквизиты и шапка
          <span class="nav-meta">Общие данные проекта и сторон</span>
        </button>
        <button class="nav-button ${active === 'ks3' ? 'active' : ''}" data-pane="ks3">
          КС-3 сводка
          <span class="nav-meta">Автосвод по листам КС-2</span>
        </button>
        <button class="nav-button ${active === 'holdbacks' ? 'active' : ''}" data-pane="holdbacks">
          Удержания
          <span class="nav-meta">Авансы, 3%, к оплате</span>
        </button>
        <button class="nav-button ${active === 'xml' ? 'active' : ''}" data-pane="xml">
          Доп. поля для XML
          <span class="nav-meta">Поля вне Excel, нужные для 1110335</span>
        </button>
      </div>
    </div>
    <div class="nav-section">
      <p class="nav-title">Листы КС-2</p>
      <div class="nav-list">
        ${ks2Buttons}
      </div>
    </div>
  `;
}

function renderStats() {
  const totalRows = app.state.ks2Sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
  const grossTotal = app.state.ks2Sheets.reduce((sum, sheet) => sum + computeSheetTotals(sheet).gross, 0);
  refs.stats.textContent = `${app.state.ks2Sheets.length} листов КС-2 · ${totalRows} строк · общая сумма с НДС: ${formatMoney(grossTotal)}`;
}

function renderContent() {
  const pane = app.state.ui.activePane;
  let html = '';

  if (pane === 'requisites') html = renderRequisitesPane();
  else if (pane === 'ks3') html = renderKs3Pane();
  else if (pane === 'holdbacks') html = renderHoldbacksPane();
  else if (pane === 'xml') html = renderXmlPane();
  else if (pane.startsWith('ks2:')) html = renderKs2Pane(Number(pane.split(':')[1]));
  else html = '<div class="panel"><div class="empty-state">Не удалось открыть выбранную вкладку.</div></div>';

  refs.content.innerHTML = html;
}

function renderRequisitesPane() {
  const c = app.state.common;
  const totals = app.state.ks2Sheets.map(computeSheetTotals);
  const totalGross = totals.reduce((sum, sheet) => sum + sheet.gross, 0);
  const totalVat = totals.reduce((sum, sheet) => sum + sheet.vat, 0);
  const totalBase = totalGross - totalVat;

  return `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">Реквизиты и общая шапка</h2>
          <p class="panel-subtitle">Эти значения одинаково используются в листах КС-2, КС-3 и при последующей генерации XML.</p>
        </div>
        <div class="badge">База загружена из example Excel</div>
      </div>

      <div class="summary-grid">
        <div class="summary-card"><span>Сумма с НДС по всем КС-2</span><strong>${formatMoney(totalGross)}</strong></div>
        <div class="summary-card"><span>Суммарный НДС</span><strong>${formatMoney(totalVat)}</strong></div>
        <div class="summary-card"><span>Сумма без НДС</span><strong>${formatMoney(totalBase)}</strong></div>
        <div class="summary-card"><span>Листов КС-2</span><strong>${app.state.ks2Sheets.length}</strong></div>
      </div>

      <div class="section-block">
        <h3>Коды формы и договор</h3>
        <div class="form-grid">
          ${renderInput('ОКУД КС-2', 'common.okudKs2', c.okudKs2, 'string', 'quarter')}
          ${renderInput('ОКУД КС-3', 'common.okudKs3', c.okudKs3, 'string', 'quarter')}
          ${renderInput('Валюта (код)', 'common.currencyCode', c.currencyCode, 'string', 'quarter')}
          ${renderInput('Валюта (наименование)', 'common.currencyName', c.currencyName, 'string', 'quarter')}
          ${renderInput('Номер договора', 'common.contractNumber', c.contractNumber, 'string', 'half')}
          ${renderInput('Дата договора', 'common.contractDate', c.contractDate, 'string', 'half')}
          ${renderInput('Вид операции', 'common.operationType', c.operationType, 'string', 'half')}
        </div>
      </div>

      <div class="section-block">
        <h3>Стороны</h3>
        <div class="form-grid">
          ${renderTextarea('Застройщик (наименование + адрес)', 'common.developerName', c.developerName, 'half')}
          ${renderInput('ОКПО застройщика', 'common.developerOkpo', c.developerOkpo, 'string', 'quarter')}
          ${renderTextarea('Технический заказчик (наименование + адрес)', 'common.techCustomerName', c.techCustomerName, 'half')}
          ${renderInput('ОКПО техзаказчика', 'common.techCustomerOkpo', c.techCustomerOkpo, 'string', 'quarter')}
          ${renderTextarea('Генподрядчик (наименование + адрес)', 'common.contractorName', c.contractorName, 'half')}
          ${renderInput('ОКПО генподрядчика', 'common.contractorOkpo', c.contractorOkpo, 'string', 'quarter')}
        </div>
      </div>

      <div class="section-block">
        <h3>Объект строительства</h3>
        <div class="form-grid">
          ${renderTextarea('Стройка', 'common.constructionObject', c.constructionObject, 'half')}
          ${renderTextarea('Объект', 'common.objectName', c.objectName, 'half')}
        </div>
      </div>
    </div>
  `;
}

function renderKs2Pane(sheetIndex) {
  const sheet = app.state.ks2Sheets[sheetIndex];
  if (!sheet) return '<div class="panel"><div class="empty-state">Лист КС-2 не найден.</div></div>';
  const totals = computeSheetTotals(sheet);

  const rows = sheet.rows.map((row, rowIndex) => `
    <tr class="${row.type === 'section' ? 'section-row' : row.type === 'note' ? 'note-row' : ''}">
      <td>
        <select data-path="ks2Sheets.${sheetIndex}.rows.${rowIndex}.type">
          ${renderOptions(['item', 'section', 'note'], row.type, { item: 'Строка', section: 'Раздел', note: 'Примечание' })}
        </select>
      </td>
      <td><input data-path="ks2Sheets.${sheetIndex}.rows.${rowIndex}.code" value="${escapeAttr(row.code)}" /></td>
      <td><input data-path="ks2Sheets.${sheetIndex}.rows.${rowIndex}.lineNo" value="${escapeAttr(row.lineNo)}" /></td>
      <td><input data-path="ks2Sheets.${sheetIndex}.rows.${rowIndex}.estimateNo" value="${escapeAttr(row.estimateNo)}" /></td>
      <td><textarea data-path="ks2Sheets.${sheetIndex}.rows.${rowIndex}.name">${escapeHtml(row.name)}</textarea></td>
      <td><input data-path="ks2Sheets.${sheetIndex}.rows.${rowIndex}.unit" value="${escapeAttr(row.unit)}" /></td>
      <td class="number-cell"><input data-path="ks2Sheets.${sheetIndex}.rows.${rowIndex}.quantity" data-value-type="number" value="${formatEditableNumber(row.quantity)}" /></td>
      <td class="number-cell"><input data-path="ks2Sheets.${sheetIndex}.rows.${rowIndex}.price" data-value-type="number" value="${formatEditableNumber(row.price)}" /></td>
      <td class="amount-cell">${formatMoney(row.amount)}</td>
      <td class="number-cell"><input data-path="ks2Sheets.${sheetIndex}.rows.${rowIndex}.unitConsumption" data-value-type="number" value="${formatEditableNumber(row.unitConsumption)}" /></td>
      <td>
        <select data-path="ks2Sheets.${sheetIndex}.rows.${rowIndex}.category">
          ${renderOptions(['work', 'metal', 'frame', 'concrete', 'misc', 'material'], row.category, {
            work: 'Работа',
            metal: 'Металлопрокат',
            frame: 'Каркас',
            concrete: 'Бетон',
            misc: 'Прочее',
            material: 'Материал',
          })}
        </select>
      </td>
      <td><textarea data-path="ks2Sheets.${sheetIndex}.rows.${rowIndex}.note">${escapeHtml(row.note)}</textarea></td>
      <td class="actions-cell"><button class="mini danger" data-action="delete-row" data-sheet-index="${sheetIndex}" data-row-index="${rowIndex}">Удалить</button></td>
    </tr>
  `).join('');

  return `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">${escapeHtml(sheet.title)}</h2>
          <p class="panel-subtitle">Таблица построена по структуре Excel: шапка акта, основание, разделы, строки работ и итоговый блок.</p>
        </div>
        <div class="inline-actions">
          <button class="secondary" data-action="duplicate-sheet" data-sheet-index="${sheetIndex}">Дублировать лист</button>
          <button class="danger" data-action="delete-sheet" data-sheet-index="${sheetIndex}">Удалить лист</button>
        </div>
      </div>

      <div class="summary-grid">
        <div class="summary-card"><span>Сумма с НДС</span><strong>${formatMoney(totals.gross)}</strong></div>
        <div class="summary-card"><span>НДС (${sheet.vatRate}%)</span><strong>${formatMoney(totals.vat)}</strong></div>
        <div class="summary-card"><span>Без НДС</span><strong>${formatMoney(totals.base)}</strong></div>
        <div class="summary-card"><span>Строки работ</span><strong>${sheet.rows.filter((row) => row.type === 'item').length}</strong></div>
      </div>

      <div class="breakdown-list">
        ${Object.entries(totals.breakdown).map(([label, amount]) => `<span class="breakdown-chip">${categoryLabel(label)}: ${formatMoney(amount)}</span>`).join('')}
      </div>

      <div class="section-block">
        <h3>Шапка документа</h3>
        <div class="form-grid">
          ${renderInput('Название листа', `ks2Sheets.${sheetIndex}.title`, sheet.title, 'string', 'half')}
          ${renderInput('Номер документа', `ks2Sheets.${sheetIndex}.documentNumber`, sheet.documentNumber, 'string', 'quarter')}
          ${renderInput('Дата документа', `ks2Sheets.${sheetIndex}.documentDate`, sheet.documentDate, 'string', 'quarter')}
          ${renderInput('Период с', `ks2Sheets.${sheetIndex}.periodFrom`, sheet.periodFrom, 'string', 'quarter')}
          ${renderInput('Период по', `ks2Sheets.${sheetIndex}.periodTo`, sheet.periodTo, 'string', 'quarter')}
          ${renderInput('Ставка НДС, %', `ks2Sheets.${sheetIndex}.vatRate`, sheet.vatRate, 'number', 'quarter')}
          ${renderTextarea('Основание акта', `ks2Sheets.${sheetIndex}.basis`, sheet.basis, 'half')}
        </div>
      </div>

      <div class="section-block">
        <h3>Строки работ и затрат</h3>
        <p>Можно построчно добавлять работы, вставлять разделы и служебные примечания, как в исходном Excel.</p>
        <div class="table-wrapper">
          <table class="table table-ks2">
            <colgroup>
              <col class="ks2-col-type" />
              <col class="ks2-col-code" />
              <col class="ks2-col-line" />
              <col class="ks2-col-estimate" />
              <col class="ks2-col-name" />
              <col class="ks2-col-unit" />
              <col class="ks2-col-qty" />
              <col class="ks2-col-price" />
              <col class="ks2-col-amount" />
              <col class="ks2-col-consumption" />
              <col class="ks2-col-category" />
              <col class="ks2-col-note" />
              <col class="ks2-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>Тип</th>
                <th>Код</th>
                <th>№ п/п</th>
                <th>№ сметы</th>
                <th>Наименование</th>
                <th>Ед.</th>
                <th>Объем</th>
                <th>Цена с НДС</th>
                <th>Сумма</th>
                <th>Расход</th>
                <th>Категория</th>
                <th>Примечание</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="inline-actions">
          <button class="mini" data-action="add-item-row" data-sheet-index="${sheetIndex}">+ Строка работы</button>
          <button class="mini secondary" data-action="add-section-row" data-sheet-index="${sheetIndex}">+ Раздел</button>
          <button class="mini secondary" data-action="add-note-row" data-sheet-index="${sheetIndex}">+ Примечание</button>
        </div>
      </div>
    </div>
  `;
}

function renderKs3Pane() {
  const ks3 = app.state.ks3;
  const rows = buildKs3Rows();
  const totals = rows.reduce((acc, row) => {
    acc.fromStart += row.fromStart;
    acc.fromYearStart += row.fromYearStart;
    acc.forPeriod += row.forPeriod;
    return acc;
  }, { fromStart: 0, fromYearStart: 0, forPeriod: 0 });
  const vat = rows.reduce((sum, row) => sum + row.vat, 0);

  return `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">КС-3 — сводная справка</h2>
          <p class="panel-subtitle">На первом этапе сводка строится автоматически из листов КС-2. Позже сюда можно добавить накопительный итог и экспорт в финальный шаблон.</p>
        </div>
      </div>

      <div class="form-grid">
        ${renderInput('Номер справки', 'ks3.documentNumber', ks3.documentNumber, 'string', 'quarter')}
        ${renderInput('Дата составления', 'ks3.documentDate', ks3.documentDate, 'string', 'quarter')}
        ${renderInput('Период с', 'ks3.periodFrom', ks3.periodFrom, 'string', 'quarter')}
        ${renderInput('Период по', 'ks3.periodTo', ks3.periodTo, 'string', 'quarter')}
      </div>

      <div class="section-block">
        <h3>Автосвод по актам</h3>
        <div class="table-wrapper">
          <table class="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Наименование</th>
                <th>С начала работ</th>
                <th>С начала года</th>
                <th>За период</th>
                <th>НДС</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${escapeHtml(row.name)}</td>
                  <td>${formatMoney(row.fromStart)}</td>
                  <td>${formatMoney(row.fromYearStart)}</td>
                  <td>${formatMoney(row.forPeriod)}</td>
                  <td>${formatMoney(row.vat)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="summary-grid">
        <div class="summary-card"><span>Итого с начала работ</span><strong>${formatMoney(totals.fromStart)}</strong></div>
        <div class="summary-card"><span>Итого с начала года</span><strong>${formatMoney(totals.fromYearStart)}</strong></div>
        <div class="summary-card"><span>Итого за период</span><strong>${formatMoney(totals.forPeriod)}</strong></div>
        <div class="summary-card"><span>Сумма НДС</span><strong>${formatMoney(vat)}</strong></div>
      </div>
    </div>
  `;
}

function renderHoldbacksPane() {
  const rows = app.state.holdbacks.rows.map((row, index) => {
    const computed = computeHoldbackRow(row);
    return `
      <tr>
        <td><textarea data-path="holdbacks.rows.${index}.name">${escapeHtml(row.name)}</textarea></td>
        <td><input data-path="holdbacks.rows.${index}.ks2Amount" data-value-type="number" value="${formatEditableNumber(row.ks2Amount)}" /></td>
        <td><input data-path="holdbacks.rows.${index}.materialsUsed" data-value-type="number" value="${formatEditableNumber(row.materialsUsed)}" /></td>
        <td><input data-path="holdbacks.rows.${index}.advanceReceived" data-value-type="number" value="${formatEditableNumber(row.advanceReceived)}" /></td>
        <td><input data-path="holdbacks.rows.${index}.advanceDoc" value="${escapeAttr(row.advanceDoc)}" /></td>
        <td><input data-path="holdbacks.rows.${index}.previousBalance" data-value-type="number" value="${formatEditableNumber(row.previousBalance)}" /></td>
        <td><input data-path="holdbacks.rows.${index}.closingAmount" data-value-type="number" value="${formatEditableNumber(row.closingAmount)}" /></td>
        <td>${formatMoney(computed.nextBalance)}</td>
        <td><input data-path="holdbacks.rows.${index}.retentionRate" data-value-type="number" value="${formatEditableNumber(row.retentionRate)}" /></td>
        <td>${formatMoney(computed.retentionAmount)}</td>
        <td>${formatMoney(computed.payableAmount)}</td>
        <td><textarea data-path="holdbacks.rows.${index}.comment">${escapeHtml(row.comment)}</textarea></td>
        <td><button class="mini danger" data-action="delete-holdback-row" data-hold-index="${index}">Удалить</button></td>
      </tr>
    `;
  }).join('');

  const totals = app.state.holdbacks.rows.reduce((acc, row) => {
    const computed = computeHoldbackRow(row);
    acc.ks2Amount += numberOrZero(row.ks2Amount);
    acc.materialsUsed += numberOrZero(row.materialsUsed);
    acc.advanceReceived += numberOrZero(row.advanceReceived);
    acc.closingAmount += numberOrZero(row.closingAmount);
    acc.retentionAmount += computed.retentionAmount;
    acc.payableAmount += computed.payableAmount;
    return acc;
  }, { ks2Amount: 0, materialsUsed: 0, advanceReceived: 0, closingAmount: 0, retentionAmount: 0, payableAmount: 0 });

  return `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">Удержания и авансы</h2>
          <p class="panel-subtitle">Отдельная вкладка под расчёт зачетов аванса, удержания 3% и итоговой суммы к оплате. Формулы упрощены, но структура повторяет Excel-лист.</p>
        </div>
        <button class="mini" data-action="add-holdback-row">+ Добавить строку</button>
      </div>

      <div class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th>Наименование</th>
              <th>Сумма КС-2</th>
              <th>Материалы</th>
              <th>Полученный аванс</th>
              <th>Документ аванса</th>
              <th>Остаток прошлого периода</th>
              <th>Сумма закрытия</th>
              <th>Остаток дальше</th>
              <th>Удержание, %</th>
              <th>Сумма удержания</th>
              <th>К оплате</th>
              <th>Комментарий</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <div class="summary-grid section-block">
        <div class="summary-card"><span>Сумма КС-2</span><strong>${formatMoney(totals.ks2Amount)}</strong></div>
        <div class="summary-card"><span>Материалы</span><strong>${formatMoney(totals.materialsUsed)}</strong></div>
        <div class="summary-card"><span>Закрытие аванса</span><strong>${formatMoney(totals.closingAmount)}</strong></div>
        <div class="summary-card"><span>Удержания</span><strong>${formatMoney(totals.retentionAmount)}</strong></div>
        <div class="summary-card"><span>Итого к оплате</span><strong>${formatMoney(totals.payableAmount)}</strong></div>
      </div>
    </div>
  `;
}

function renderXmlPane() {
  const generated = buildGeneratedXmlFields();
  const constants = app.state.xmlExtras.constants;
  const manual = app.state.xmlExtras.manual;

  return `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">Дополнительные поля для XML</h2>
          <p class="panel-subtitle">Сюда вынесены обязательные данные КНД 1110335, которых нет напрямую в Excel: ИНН, индексы, признаки формирования, реквизиты допсоглашений и т.п.</p>
        </div>
      </div>

      <div class="section-block">
        <h3>Автогенерируемые поля</h3>
        <div class="form-grid">
          ${renderReadonly('Идентификатор файла', generated.fileId, 'half')}
          ${renderReadonly('Дата формирования', generated.fileDate, 'quarter')}
          ${renderReadonly('Время формирования', generated.fileTime, 'quarter')}
          ${renderReadonly('КНД', generated.knd, 'quarter')}
          ${renderReadonly('Версия формата', generated.formatVersion, 'quarter')}
          ${renderReadonly('Версия программы', generated.programVersion, 'quarter')}
        </div>
      </div>

      <div class="section-block">
        <h3>Постоянные настройки документа</h3>
        <div class="form-grid">
          ${renderSelect('Строительство для гос/мун нужд', 'xmlExtras.constants.isGovMunicipal', constants.isGovMunicipal, { '0': '0 — нет', '1': '1 — да' }, 'quarter')}
          ${renderSelect('НДС только в итоговой строке', 'xmlExtras.constants.vatCalcInTotalOnly', constants.vatCalcInTotalOnly, { '0': '0 — нет', '1': '1 — да' }, 'quarter')}
          ${renderSelect('Признак накопительного итога', 'xmlExtras.constants.cumulativeMode', constants.cumulativeMode, { '0': '0 — без накопления', '1': '1 — в акте всё', '2': '2 — только строка «Всего»' }, 'half')}
          ${renderInput('Год индекса цен', 'xmlExtras.constants.priceIndexYear', constants.priceIndexYear, 'string', 'quarter')}
          ${renderSelect('Сведения о расчётах для согласования', 'xmlExtras.constants.requiresSettlementApproval', constants.requiresSettlementApproval, { '0': '0 — нет', '1': '1 — да' }, 'quarter')}
        </div>
      </div>

      <div class="section-block">
        <h3>Ручные поля, которых нет в Excel</h3>
        <div class="form-grid">
          ${renderInput('Наименование экономического субъекта-составителя', 'xmlExtras.manual.economicSubjectName', manual.economicSubjectName, 'string', 'half')}
          ${renderInput('Версия сметы (КодСмет)', 'xmlExtras.manual.estimateVersionCode', manual.estimateVersionCode, 'string', 'quarter')}
          ${renderInput('Тип допсоглашения', 'xmlExtras.manual.supplementDocType', manual.supplementDocType, 'string', 'quarter')}
          ${renderInput('Номер допсоглашения', 'xmlExtras.manual.supplementDocNumber', manual.supplementDocNumber, 'string', 'quarter')}
          ${renderInput('Дата допсоглашения', 'xmlExtras.manual.supplementDocDate', manual.supplementDocDate, 'string', 'quarter')}
          ${renderInput('ИНН подрядчика', 'xmlExtras.manual.contractorInn', manual.contractorInn, 'string', 'quarter')}
          ${renderInput('ИНН заказчика', 'xmlExtras.manual.customerInn', manual.customerInn, 'string', 'quarter')}
          ${renderInput('Индекс застройщика', 'xmlExtras.manual.developerPostalIndex', manual.developerPostalIndex, 'string', 'quarter')}
          ${renderInput('Код региона застройщика', 'xmlExtras.manual.developerRegionCode', manual.developerRegionCode, 'string', 'quarter')}
          ${renderInput('Индекс подрядчика', 'xmlExtras.manual.contractorPostalIndex', manual.contractorPostalIndex, 'string', 'quarter')}
          ${renderInput('Код региона подрядчика', 'xmlExtras.manual.contractorRegionCode', manual.contractorRegionCode, 'string', 'quarter')}
          ${renderInput('Исправление №', 'xmlExtras.manual.correctionNumber', manual.correctionNumber, 'string', 'quarter')}
          ${renderInput('Дата исправления', 'xmlExtras.manual.correctionDate', manual.correctionDate, 'string', 'quarter')}
        </div>
      </div>

      <div class="section-block">
        <h3>Прослеживаемые товары / материалы</h3>
        <div class="table-wrapper">
          <table class="table">
            <thead>
              <tr>
                <th>РНПТ / рег. номер партии</th>
                <th>Код ед. учёта</th>
                <th>Наименование единицы</th>
                <th>Количество</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${app.state.xmlExtras.traceableGoods.map((row, index) => `
                <tr>
                  <td><input data-path="xmlExtras.traceableGoods.${index}.registrationNumber" value="${escapeAttr(row.registrationNumber)}" /></td>
                  <td><input data-path="xmlExtras.traceableGoods.${index}.unitCode" value="${escapeAttr(row.unitCode)}" /></td>
                  <td><input data-path="xmlExtras.traceableGoods.${index}.unitName" value="${escapeAttr(row.unitName)}" /></td>
                  <td><input data-path="xmlExtras.traceableGoods.${index}.quantity" data-value-type="number" value="${formatEditableNumber(row.quantity)}" /></td>
                  <td><button class="mini danger" data-action="delete-trace-row" data-trace-index="${index}">Удалить</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="inline-actions">
          <button class="mini" data-action="add-trace-row">+ Добавить строку прослеживаемости</button>
        </div>
        <p class="kbd-note">Отдельная вкладка нужна специально для полей, которые не видны пользователю в Excel, но обязательны для валидного XML 1110335.</p>
      </div>
    </div>
  `;
}

function buildKs3Rows() {
  return app.state.ks2Sheets.map((sheet) => {
    const totals = computeSheetTotals(sheet);
    return {
      name: `Акт №${sheet.documentNumber || '—'} · ${sheet.basis || sheet.title}`,
      fromStart: totals.gross,
      fromYearStart: totals.gross,
      forPeriod: totals.gross,
      vat: totals.vat,
    };
  });
}

function buildGeneratedXmlFields() {
  const generated = app.state.xmlExtras.generated;
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8);
  const documentNumber = app.state.ks2Sheets[0]?.documentNumber || '1';
  const contractorInn = app.state.xmlExtras.manual.contractorInn || 'INN';
  return {
    fileDate: generated.fileDate || date,
    fileTime: generated.fileTime || time,
    knd: generated.knd || '1110335',
    formatVersion: generated.formatVersion || '1.00',
    programVersion: generated.programVersion || 'prototype-0.1.0',
    fileId: `ON_AKT_${contractorInn}_${date.replaceAll('-', '')}_${String(documentNumber).padStart(3, '0')}`,
  };
}

function computeSheetTotals(sheet) {
  const gross = sheet.rows
    .filter((row) => row.type === 'item')
    .reduce((sum, row) => sum + numberOrZero(computeRowAmount(row)), 0);
  const vatRate = numberOrZero(sheet.vatRate);
  const vat = vatRate ? round2(gross * vatRate / (100 + vatRate)) : 0;
  const base = round2(gross - vat);
  const breakdown = { work: 0, metal: 0, frame: 0, concrete: 0, misc: 0, material: 0 };

  sheet.rows.filter((row) => row.type === 'item').forEach((row) => {
    const category = row.category || 'work';
    breakdown[category] = round2((breakdown[category] || 0) + numberOrZero(row.amount));
  });

  return { gross: round2(gross), vat, base, breakdown };
}

function computeHoldbackRow(row) {
  const ks2Amount = numberOrZero(row.ks2Amount);
  const advanceReceived = numberOrZero(row.advanceReceived);
  const previousBalance = row.previousBalance == null ? advanceReceived : numberOrZero(row.previousBalance);
  const closingAmount = numberOrZero(row.closingAmount);
  const retentionRate = numberOrZero(row.retentionRate || 0);
  const retentionAmount = round2(ks2Amount * retentionRate / 100);
  const nextBalance = round2(Math.max(previousBalance - closingAmount, 0));
  const payableAmount = round2(ks2Amount - closingAmount - retentionAmount);
  return { nextBalance, retentionAmount, payableAmount };
}

function computeRowAmount(row) {
  if (row.type !== 'item') return null;
  const quantity = numberOrNull(row.quantity);
  const price = numberOrNull(row.price);
  if (quantity == null || price == null) return numberOrNull(row.amount);
  return round2(quantity * price);
}

function createBlankSheet(number) {
  return {
    id: `ks2-${Date.now()}`,
    title: `КС-2 №${number}`,
    documentNumber: String(number),
    documentDate: new Date().toISOString().slice(0, 10),
    periodFrom: new Date().toISOString().slice(0, 10),
    periodTo: new Date().toISOString().slice(0, 10),
    basis: '',
    vatRate: 22,
    rows: [createBlankRow('section'), createBlankRow('item')],
    totals: { gross: 0, vat: 0, breakdown: [] },
  };
}

function createBlankRow(type = 'item') {
  return {
    type,
    code: '',
    lineNo: '',
    estimateNo: '',
    name: type === 'section' ? 'Новый раздел' : '',
    unit: '',
    quantity: null,
    price: null,
    amount: null,
    unitConsumption: null,
    note: '',
    category: type === 'item' ? 'work' : 'misc',
  };
}

function createBlankHoldbackRow() {
  return {
    name: '',
    ks2Amount: null,
    materialsUsed: null,
    advanceReceived: null,
    advanceDoc: '',
    previousBalance: null,
    closingAmount: null,
    nextBalance: null,
    retentionAmount: null,
    payableAmount: null,
    retentionRate: 3,
    comment: '',
  };
}

function renderInput(label, path, value, valueType = 'string', size = '') {
  return `
    <div class="field ${size}">
      <label>${label}</label>
      <input data-path="${path}" data-value-type="${valueType}" value="${escapeAttr(value ?? '')}" />
    </div>
  `;
}

function renderTextarea(label, path, value, size = 'half') {
  return `
    <div class="field ${size}">
      <label>${label}</label>
      <textarea data-path="${path}">${escapeHtml(value ?? '')}</textarea>
    </div>
  `;
}

function renderReadonly(label, value, size = '') {
  return `
    <div class="field ${size}">
      <label>${label}</label>
      <div class="readonly">${escapeHtml(String(value ?? ''))}</div>
    </div>
  `;
}

function renderSelect(label, path, selected, options, size = '') {
  return `
    <div class="field ${size}">
      <label>${label}</label>
      <select data-path="${path}">
        ${Object.entries(options).map(([value, text]) => `<option value="${escapeAttr(value)}" ${String(selected) === String(value) ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}
      </select>
    </div>
  `;
}

function renderOptions(values, selected, labels = {}) {
  return values.map((value) => `<option value="${escapeAttr(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(labels[value] || value)}</option>`).join('');
}

function setByPath(target, path, value) {
  const parts = path.split('.');
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = isIndex(parts[i]) ? Number(parts[i]) : parts[i];
    cursor = cursor[key];
  }
  const last = isIndex(parts[parts.length - 1]) ? Number(parts[parts.length - 1]) : parts[parts.length - 1];
  cursor[last] = value;
}

function coerceValue(value, type) {
  if (type === 'number') {
    if (value === '' || value == null) return null;
    const normalized = Number(String(value).replace(',', '.'));
    return Number.isFinite(normalized) ? round2(normalized) : null;
  }
  return value;
}

function inferCategory(name, note) {
  const source = `${name} ${note}`.toLowerCase();
  if (/арматур|металл|сталь/.test(source)) return 'metal';
  if (/каркас/.test(source)) return 'frame';
  if (/бетон/.test(source)) return 'concrete';
  if (/материал|щебень|песок|гидрошпон|плита|пвх|gener/.test(source)) return 'material';
  if (/проч|пр.мат/.test(source)) return 'misc';
  return 'work';
}

function categoryLabel(key) {
  return ({
    work: 'Работа',
    metal: 'Металлопрокат',
    frame: 'Каркас',
    concrete: 'Бетон',
    misc: 'Прочее',
    material: 'Материал',
  })[key] || key;
}

function flash(message) {
  refs.flash.textContent = message;
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => {
    refs.flash.textContent = '';
  }, 2800);
}

function formatMoney(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatEditableNumber(value) {
  return value == null || Number.isNaN(value) ? '' : String(value);
}

function numberOrNull(value) {
  if (value === '' || value == null) return null;
  const numeric = Number(String(value).replace(',', '.'));
  return Number.isFinite(numeric) ? round2(numeric) : null;
}

function numberOrZero(value) {
  return numberOrNull(value) ?? 0;
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", '&#39;');
}

function isIndex(value) {
  return /^\d+$/.test(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
