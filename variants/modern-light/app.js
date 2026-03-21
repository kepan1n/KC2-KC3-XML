const STORAGE_KEY = 'kc2kc3-web-form-v1';

const refs = {
  appShell: document.getElementById('app-shell'),
  navStrip: document.getElementById('nav-strip'),
  content: document.getElementById('content'),
  stats: document.getElementById('stats'),
  flash: document.getElementById('flash'),
  loadSample: document.getElementById('load-sample'),
  saveLocal: document.getElementById('save-local'),
  saveServer: document.getElementById('save-server'),
  loadServer: document.getElementById('load-server'),
  exportJson: document.getElementById('export-json'),
  exportXml: document.getElementById('export-xml'),
  addSheet: document.getElementById('add-ks2-sheet'),
  ks2ViewSwitcherSlot: document.getElementById('ks2-view-switcher-slot'),
  toggleHeaders: document.getElementById('toggle-headers'),
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

const EXPENSE_TYPE_OPTIONS = {
  '1': '1 — работа',
  '2': '2 — услуга',
  '3': '3 — товар как объект ОС',
  '4': '4 — иной товар',
  '5': '5 — косвенные расходы',
  '6': '6 — давальческие материалы',
};

const CLAIM_TYPE_OPTIONS = {
  '01': '01 — штрафы / пени заказчика',
  '02': '02 — обязательства заказчика по гарантийному удержанию / отложенному платежу',
  '03': '03 — исправление ошибок прошлых периодов',
  '04': '04 — требования по иным объектам строительства',
  '05': '05 — иные засчитываемые встречные требования заказчика',
};

const WITHHOLD_TYPE_OPTIONS = {
  '31': '31 — зачет аванса',
  '32': '32 — гарантийное удержание / отложенный платеж',
  '33': '33 — удержание штрафов / пеней подрядчика',
  '34': '34 — исправление ошибок прошлых периодов',
  '35': '35 — удержания по иным объектам строительства',
  '36': '36 — иные засчитываемые встречные удержания',
};

const SETTLEMENT_ROW_PRESETS = {
  claimPenalty: { kind: 'claim', kindCode: '01', label: 'Требование: штрафы / пени' },
  claimGuarantee: { kind: 'claim', kindCode: '02', label: 'Требование: гарантийное удержание / отложенный платеж' },
  claimErrorCorrection: { kind: 'claim', kindCode: '03', label: 'Требование: исправление ошибок' },
  claimOtherObjects: { kind: 'claim', kindCode: '04', label: 'Требование: иной объект' },
  claimOther: { kind: 'claim', kindCode: '05', label: 'Требование: иное' },
  withholdAdvance: { kind: 'withhold', kindCode: '31', label: 'Удержание: зачет аванса' },
  withholdGuarantee: { kind: 'withhold', kindCode: '32', label: 'Удержание: гарантийное удержание' },
  withholdPenalty: { kind: 'withhold', kindCode: '33', label: 'Удержание: штрафы / пени' },
  withholdErrorCorrection: { kind: 'withhold', kindCode: '34', label: 'Удержание: исправление ошибок' },
  withholdOtherObjects: { kind: 'withhold', kindCode: '35', label: 'Удержание: иной объект' },
  withholdOther: { kind: 'withhold', kindCode: '36', label: 'Удержание: иное' },
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

  refs.saveServer?.addEventListener('click', async () => {
    const name = window.prompt('Имя сохранения на сервере:', app.state?.meta?.serverSaveName || `form-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`);
    if (!name) return;
    try {
      const response = await fetch('/api/forms/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, state: app.state }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || `Ошибка ${response.status}`);
      app.state.meta ||= {};
      app.state.meta.serverSaveName = data.name;
      flash(`Форма сохранена на сервере: ${data.name}`);
    } catch (error) {
      flash(`Не удалось сохранить на сервер: ${error.message}`);
    }
  });

  refs.loadServer?.addEventListener('click', async () => {
    try {
      const listResponse = await fetch('/api/forms/list');
      const listData = await listResponse.json();
      if (!listResponse.ok || !listData.ok) throw new Error(listData.error || `Ошибка ${listResponse.status}`);
      if (!Array.isArray(listData.items) || !listData.items.length) {
        flash('На сервере пока нет сохранённых форм.');
        return;
      }
      const options = listData.items.map((item, index) => `${index + 1}. ${item.name}`).join('\n');
      const answer = window.prompt(`Выбери форму для загрузки:\n${options}\n\nВведи номер или имя:`);
      if (!answer) return;
      let target = listData.items.find((item) => item.name === answer.trim());
      if (!target) {
        const index = Number(answer) - 1;
        if (Number.isInteger(index) && index >= 0 && index < listData.items.length) target = listData.items[index];
      }
      if (!target) {
        flash('Не удалось определить сохранённую форму.');
        return;
      }
      const loadResponse = await fetch(`/api/forms/load/${encodeURIComponent(target.name)}`);
      const loadData = await loadResponse.json();
      if (!loadResponse.ok || !loadData.ok) throw new Error(loadData.error || `Ошибка ${loadResponse.status}`);
      app.state = prepareState(loadData.state);
      app.state.meta ||= {};
      app.state.meta.serverSaveName = target.name;
      render();
      flash(`Загружена форма: ${target.name}`);
    } catch (error) {
      flash(`Не удалось загрузить с сервера: ${error.message}`);
    }
  });

  refs.exportJson.addEventListener('click', () => {
    const payload = {
      state: app.state,
      ...buildLogicBundle(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kc2-kc3-form-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    flash('JSON выгружен.');
  });

  refs.exportXml?.addEventListener('click', async () => {
    const payload = buildLogicBundle().model;
    refs.exportXml.disabled = true;
    refs.exportXml.textContent = 'Проверка XSD…';
    try {
      const response = await fetch('/api/export-xml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let errorMessage = `Ошибка ${response.status}`;
        try {
          const data = await response.json();
          if (Array.isArray(data.validationErrors) && data.validationErrors.length) {
            errorMessage = data.validationErrors.slice(0, 5).map((err) => err.message).join(' | ');
          } else if (Array.isArray(data.sheetErrors) && data.sheetErrors.length) {
            errorMessage = data.sheetErrors.slice(0, 2).map((sheet) => `${sheet.sheetTitle || `Лист ${sheet.sheetIndex + 1}`}: ${(sheet.errors || []).slice(0, 2).map((err) => err.message).join(' | ')}`).join(' || ');
          } else if (Array.isArray(data.errors) && data.errors.length) {
            errorMessage = data.errors.slice(0, 3).map((err) => `строка ${err.line}: ${err.message}`).join(' | ');
          } else if (data.error) {
            errorMessage = data.error;
          }
        } catch (_) {}
        flash(`Экспорт не выгружен: ${errorMessage}`);
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] || `${payload.xml.generated.fileId || `ON_AKTREZRABP_${new Date().toISOString().slice(0, 10)}`}.xml`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      flash(filename.endsWith('.zip') ? 'Архив XML по листам КС-2 прошёл XSD-проверку и выгружен.' : 'XML прошёл XSD-проверку и выгружен.');
    } catch (error) {
      flash(`Не удалось выполнить XSD-проверку: ${error.message}`);
    } finally {
      refs.exportXml.disabled = false;
      refs.exportXml.textContent = 'Экспорт XML / ZIP (XSD-ready)';
    }
  });

  refs.addSheet.addEventListener('click', () => {
    app.state.ks2Sheets.push(createBlankSheet(app.state.ks2Sheets.length + 1));
    app.state.ui.activePane = `ks2:${app.state.ks2Sheets.length - 1}`;
    render();
    flash('Добавлен новый лист КС-2.');
  });

  refs.toggleHeaders?.addEventListener('click', () => {
    app.state.common.showDocumentHeaders = !app.state.common.showDocumentHeaders;
    render();
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

  refs.navStrip?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-pane]');
    if (!button) return;
    app.state.ui.activePane = button.dataset.pane;
    render();
  });
  refs.ks2ViewSwitcherSlot?.addEventListener('click', handleContentClick);

  refs.content.addEventListener('click', handleContentClick);
  refs.content.addEventListener('change', handleContentChange);
  refs.content.addEventListener('mousedown', handleResizeStart);
}

function handleContentClick(event) {
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) {
    if (!event.target.closest('.row-action-stack') && hasTransientRowUi()) {
      clearTransientRowUi();
      render();
    }
    return;
  }

  const { action, sheetIndex, rowIndex, holdIndex, traceIndex, rowKind } = actionButton.dataset;
  const rowCoords = { sheetIndex: Number(sheetIndex), rowIndex: Number(rowIndex) };

  if (action === 'toggle-sheet-add-menu') {
    const idx = Number(sheetIndex);
    app.state.ui.sheetAddMenu = app.state.ui.sheetAddMenu === idx ? null : idx;
    render();
    return;
  }

  if (action === 'add-item-row') {
    clearTransientRowUi();
    const expenseType = actionButton.dataset.expenseType || '1';
    app.state.ks2Sheets[Number(sheetIndex)].rows.push(createBlankItemRowByExpenseType(expenseType));
    render();
    return;
  }

  if (action === 'add-error-correction-row') {
    clearTransientRowUi();
    const expenseType = actionButton.dataset.expenseType || '1';
    app.state.ks2Sheets[Number(sheetIndex)].rows.push(createBlankItemRowByExpenseType(expenseType, { calcMode: 'errorCorrection' }));
    render();
    return;
  }

  if (action === 'add-new-circumstance-row' || action === 'add-correction-row') {
    clearTransientRowUi();
    const expenseType = actionButton.dataset.expenseType || '1';
    app.state.ks2Sheets[Number(sheetIndex)].rows.push(createBlankItemRowByExpenseType(expenseType, { calcMode: 'newCircumstances' }));
    render();
    return;
  }

  if (action === 'add-section-row') {
    clearTransientRowUi();
    app.state.ks2Sheets[Number(sheetIndex)].rows.push(createBlankRow('section'));
    render();
    return;
  }

  if (action === 'add-note-row') {
    clearTransientRowUi();
    app.state.ks2Sheets[Number(sheetIndex)].rows.push(createBlankRow('note'));
    render();
    return;
  }

  if (action === 'set-ks2-view-mode') {
    const idx = Number(sheetIndex);
    const mode = actionButton.dataset.mode === 'xml' ? 'xml' : 'form';
    app.state.ui.ks2ViewMode[idx] = mode;
    render();
    if (mode === 'xml') loadKs2XmlPreview(idx, true);
    return;
  }

  if (action === 'refresh-ks2-xml-preview') {
    loadKs2XmlPreview(Number(sheetIndex), true);
    return;
  }

  if (action === 'toggle-row-menu') {
    const current = app.state.ui.rowActionMenu;
    const sameRow = current && current.sheetIndex === rowCoords.sheetIndex && current.rowIndex === rowCoords.rowIndex;
    app.state.ui.rowActionMenu = sameRow ? null : rowCoords;
    app.state.ui.rowDeleteConfirm = null;
    render();
    return;
  }

  if (action === 'insert-row-after') {
    clearTransientRowUi();
    const expenseType = actionButton.dataset.expenseType || '1';
    const nextRow = rowKind === 'errorCorrection'
      ? createBlankItemRowByExpenseType(expenseType, { calcMode: 'errorCorrection' })
      : rowKind === 'newCircumstances' || rowKind === 'correction'
        ? createBlankItemRowByExpenseType(expenseType, { calcMode: 'newCircumstances' })
        : rowKind === 'item'
          ? createBlankItemRowByExpenseType(expenseType)
          : createBlankRow(rowKind || 'item');
    app.state.ks2Sheets[rowCoords.sheetIndex].rows.splice(rowCoords.rowIndex + 1, 0, nextRow);
    render();
    const flashText = rowKind === 'errorCorrection'
      ? 'Строка-корректировка «исправление ошибок» добавлена.'
      : rowKind === 'newCircumstances' || rowKind === 'correction'
        ? 'Строка-корректировка «новые обстоятельства» добавлена.'
        : rowKind === 'item'
          ? `Строка типа ${expenseTypeLabel(expenseType)} добавлена.`
          : 'Строка добавлена.';
    flash(flashText);
    return;
  }

  if (action === 'prompt-delete-row') {
    app.state.ui.rowActionMenu = null;
    app.state.ui.rowDeleteConfirm = rowCoords;
    render();
    return;
  }

  if (action === 'cancel-delete-row') {
    app.state.ui.rowDeleteConfirm = null;
    render();
    return;
  }

  if (action === 'confirm-delete-row') {
    app.state.ks2Sheets[rowCoords.sheetIndex].rows.splice(rowCoords.rowIndex, 1);
    clearTransientRowUi();
    render();
    flash('Строка удалена.');
    return;
  }

  if (action === 'duplicate-sheet') {
    clearTransientRowUi();
    const sheet = clone(app.state.ks2Sheets[Number(sheetIndex)]);
    sheet.id = `ks2-${Date.now()}`;
    sheet.title = `${sheet.title} (копия)`;
    app.state.ks2Sheets.splice(Number(sheetIndex) + 1, 0, sheet);
    render();
    flash('Лист КС-2 дублирован.');
    return;
  }

  if (action === 'delete-sheet') {
    clearTransientRowUi();
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

  if (action === 'add-ks3-row') {
    clearTransientRowUi();
    app.state.ks3.rows.push(createBlankKs3Row());
    render();
    return;
  }

  if (action === 'toggle-ks3-row-menu') {
    const idx = Number(actionButton.dataset.ks3Index);
    const sameRow = app.state.ui.ks3RowActionMenu === idx;
    app.state.ui.ks3RowActionMenu = sameRow ? null : idx;
    app.state.ui.ks3RowDeleteConfirm = null;
    render();
    return;
  }

  if (action === 'insert-ks3-row-after') {
    clearTransientRowUi();
    const idx = Number(actionButton.dataset.ks3Index);
    app.state.ks3.rows.splice(idx + 1, 0, createBlankKs3Row());
    render();
    flash('Строка КС-3 добавлена.');
    return;
  }

  if (action === 'prompt-delete-ks3-row') {
    const idx = Number(actionButton.dataset.ks3Index);
    app.state.ui.ks3RowActionMenu = null;
    app.state.ui.ks3RowDeleteConfirm = idx;
    render();
    return;
  }

  if (action === 'cancel-delete-ks3-row') {
    app.state.ui.ks3RowDeleteConfirm = null;
    render();
    return;
  }

  if (action === 'confirm-delete-ks3-row') {
    const idx = Number(actionButton.dataset.ks3Index);
    app.state.ks3.rows.splice(idx, 1);
    clearTransientRowUi();
    render();
    flash('Строка КС-3 удалена.');
    return;
  }

  if (action === 'add-holdback-row') {
    const targetSheetIndex = Number(actionButton.dataset.sheetIndex);
    const targetSheetId = app.state.ks2Sheets[targetSheetIndex]?.id || '';
    app.state.holdbacks.rows.push(createBlankHoldbackRow('section', targetSheetId));
    render();
    return;
  }

  if (action === 'open-holdback-menu') {
    const idx = Number(holdIndex);
    app.state.ui.holdbackDeleteConfirm = null;
    app.state.ui.holdbackActionMenu = app.state.ui.holdbackActionMenu === idx ? null : idx;
    render();
    return;
  }

  if (action === 'insert-holdback-section') {
    const idx = Number(holdIndex);
    const targetSheetId = app.state.holdbacks.rows[idx]?.ks2SheetId || '';
    app.state.holdbacks.rows.splice(idx + 1, 0, createBlankHoldbackRow('section', targetSheetId));
    app.state.ui.holdbackActionMenu = null;
    render();
    return;
  }

  if (action === 'insert-holdback-subitem') {
    const idx = Number(holdIndex);
    const baseRow = app.state.holdbacks.rows[idx];
    const sectionIndex = (baseRow?.kind || 'section') === 'subitem' ? findHoldbackSectionIndex(idx) : idx;
    let insertAt = sectionIndex + 1;
    while (insertAt < app.state.holdbacks.rows.length && (app.state.holdbacks.rows[insertAt].kind || 'section') === 'subitem') {
      insertAt += 1;
    }
    const targetSheetId = app.state.holdbacks.rows[sectionIndex]?.ks2SheetId || '';
    app.state.holdbacks.rows.splice(insertAt, 0, createBlankHoldbackRow('subitem', targetSheetId));
    app.state.ui.holdbackActionMenu = null;
    render();
    return;
  }

  if (action === 'request-holdback-delete') {
    const idx = Number(holdIndex);
    app.state.ui.holdbackActionMenu = null;
    app.state.ui.holdbackDeleteConfirm = idx;
    render();
    return;
  }

  if (action === 'cancel-holdback-delete') {
    app.state.ui.holdbackDeleteConfirm = null;
    render();
    return;
  }

  if (action === 'confirm-holdback-delete') {
    const idx = Number(holdIndex);
    const kind = app.state.holdbacks.rows[idx]?.kind || 'section';
    if (kind === 'subitem') {
      app.state.holdbacks.rows.splice(idx, 1);
    } else {
      let deleteCount = 1;
      while (idx + deleteCount < app.state.holdbacks.rows.length && (app.state.holdbacks.rows[idx + deleteCount].kind || 'section') === 'subitem') {
        deleteCount += 1;
      }
      app.state.holdbacks.rows.splice(idx, deleteCount);
    }
    app.state.ui.holdbackDeleteConfirm = null;
    render();
    return;
  }

  if (action === 'toggle-settlement-add-menu') {
    app.state.ui.settlementDeleteConfirm = null;
    app.state.ui.settlementAddMenu = !app.state.ui.settlementAddMenu;
    render();
    return;
  }

  if (action === 'add-settlement-row') {
    clearTransientRowUi();
    const presetKey = actionButton.dataset.preset || 'withholdAdvance';
    const isFirst = !(app.state.xmlExtras.settlementRows || []).length;
    app.state.xmlExtras.settlementRows.push(createBlankSettlementRow(presetKey, { isPrimary: isFirst }));
    app.state = prepareState(app.state);
    render();
    flash(`Добавлена строка XML: ${SETTLEMENT_ROW_PRESETS[presetKey]?.label || 'расчеты / удержания'}.`);
    return;
  }

  if (action === 'set-primary-settlement-row') {
    const idx = Number(actionButton.dataset.settlementIndex);
    app.state.xmlExtras.settlementRows = (app.state.xmlExtras.settlementRows || []).map((row, rowIndex) => ({
      ...row,
      isPrimary: rowIndex === idx,
    }));
    app.state = prepareState(app.state);
    render();
    flash('Основная XSD-ready строка выбрана.');
    return;
  }

  if (action === 'request-settlement-delete') {
    app.state.ui.settlementDeleteConfirm = Number(actionButton.dataset.settlementIndex);
    render();
    return;
  }

  if (action === 'cancel-settlement-delete') {
    app.state.ui.settlementDeleteConfirm = null;
    render();
    return;
  }

  if (action === 'confirm-settlement-delete') {
    app.state.xmlExtras.settlementRows.splice(Number(actionButton.dataset.settlementIndex), 1);
    app.state.ui.settlementDeleteConfirm = null;
    app.state = prepareState(app.state);
    render();
    flash('Строка XML-расчетов удалена.');
    return;
  }

  if (action === 'add-trace-row') {
    clearTransientRowUi();
    app.state.xmlExtras.traceableGoods.push({ registrationNumber: '', unitCode: '', unitName: '', quantity: null });
    render();
    return;
  }

  if (action === 'delete-trace-row') {
    clearTransientRowUi();
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
  app.state.ui.ks2XmlPreview = {};
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

function normalizeSearchText(value) {
  return String(value || '').toLowerCase().replaceAll('ё', 'е').replace(/\s+/g, ' ').trim();
}

function tokenizeSearchText(value) {
  return normalizeSearchText(value).match(/[a-zа-я0-9]+/g)?.filter((token) => token.length >= 6) || [];
}

function guessKs2SheetIdForHoldbackRow(row, ks2Sheets) {
  if (!row || (row.kind || row.type || 'section') === 'subitem') return row?.ks2SheetId || '';
  if (row.ks2SheetId) return row.ks2SheetId;
  if (ks2Sheets.length === 1) return ks2Sheets[0].id;

  const rowText = normalizeSearchText(`${row.name || ''} ${row.comment || ''}`);
  let best = null;
  ks2Sheets.forEach((sheet, index) => {
    const docNumber = String(sheet.documentNumber || sheet.document?.number || index + 1).trim();
    let score = 0;
    if (docNumber && [
      `кс-2 №${docNumber}`,
      `кс2 №${docNumber}`,
      `акт №${docNumber}`,
    ].some((sample) => rowText.includes(sample))) {
      score += 200;
    }
    const title = normalizeSearchText(sheet.title || '');
    const basis = normalizeSearchText(sheet.basis || sheet.document?.basis || '');
    if (title && rowText.includes(title)) score += 50;
    if (basis && rowText.includes(basis)) score += 50;
    [...tokenizeSearchText(sheet.title), ...tokenizeSearchText(sheet.basis || sheet.document?.basis)].forEach((token) => {
      if (rowText.includes(token)) score += 10;
    });
    if (!best || score > best.score) best = { id: sheet.id, score };
  });
  return best?.score > 0 ? best.id : '';
}

function prepareState(raw) {
  const data = clone(raw);
  data.ui ??= {};
  data.ui.activePane ??= 'requisites';
  if (data.ui.activePane === 'ks3' || data.ui.activePane === 'holdbacks') {
    data.ui.activePane = 'requisites';
  }
  data.ui.scale = normalizeScale(data.ui.scale ?? 100);
  data.ui.compactRows = data.ui.compactRows ?? true;
  data.ui.rowActionMenu ??= null;
  data.ui.rowDeleteConfirm ??= null;
  data.ui.ks3RowActionMenu ??= null;
  data.ui.ks3RowDeleteConfirm ??= null;
  data.ui.sheetAddMenu ??= null;
  data.ui.holdbackActionMenu ??= null;
  data.ui.holdbackDeleteConfirm ??= null;
  data.ui.settlementAddMenu ??= false;
  data.ui.settlementDeleteConfirm ??= null;
  data.ui.ks2ViewMode ??= {};
  data.ui.ks2XmlPreview ??= {};
  data.ui.columnWidths ??= {};
  data.common ??= {};
  data.ks3 ??= {};
  data.holdbacks ??= { rows: [] };
  data.holdbacks.rows ??= [];
  data.xmlExtras ??= {};
  data.xmlExtras.generated ??= {};
  data.xmlExtras.constants ??= {};
  data.xmlExtras.manual ??= {};
  data.xmlExtras.traceableGoods ??= [];
  data.xmlExtras.settlementRows ??= [];
  data.xmlExtras.settlementRows = (data.xmlExtras.settlementRows || []).map((row) => prepareSettlementRow(row));
  if (data.xmlExtras.settlementRows.length && !data.xmlExtras.settlementRows.some((row) => row.isPrimary)) {
    data.xmlExtras.settlementRows[0].isPrimary = true;
  }
  data.xmlExtras.constants.isGovMunicipal ||= '0';
  data.xmlExtras.constants.vatCalcInTotalOnly ||= '0';
  data.xmlExtras.constants.cumulativeMode ||= '1';
  data.xmlExtras.constants.priceIndexYear ||= '0000';
  data.xmlExtras.constants.requiresSettlementApproval ||= '0';
  data.xmlExtras.constants.diadocCompactMode ||= '0';
  data.xmlExtras.manual.isCorrectionAct ||= '0';
  data.xmlExtras.manual.hasEstimateChange ||= '1';

  data.common.okudKs3 = data.common.okudKs3 && data.common.okudKs3 !== 'Форма по ОКУД' ? data.common.okudKs3 : '0322001';
  data.common.showDocumentHeaders = data.common.showDocumentHeaders ?? false;
  data.common.showDocumentSignatures = data.common.showDocumentSignatures ?? false;
  data.common.contractorSignLabel ||= 'Сдал';
  data.common.contractorSignerPosition ||= 'Генеральный директор ООО «ЛегендаЭлит»';
  data.common.contractorSignerName ||= 'А. Дылюк';
  data.common.customerSignLabel ||= 'Принял';
  data.common.customerSignerPosition ||= 'ООО «СЗ «АСПЕЙС Хорошевская» в лице Генерального директора управляющей организации ООО «АСПЕЙС Девелопмент»';
  data.common.customerSignerName ||= 'О.В. Смирнов';
  data.common.objectOkpo ||= '';
  data.common.okdpCode ||= '';
  data.common.ks2DocLabel ||= 'АКТ';
  data.common.ks2DocSubtitle ||= 'О ПРИЕМКЕ ВЫПОЛНЕННЫХ РАБОТ';
  data.common.ks3DocLabel ||= 'СПРАВКА';
  data.common.ks3DocSubtitle ||= 'О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ И ЗАТРАТ';
  data.common.ks3DeveloperPosition ||= data.common.customerSignerPosition || '';
  data.common.ks3DeveloperName ||= data.common.customerSignerName || '';
  data.common.ks3TechCustomerPosition ||= data.common.techCustomerSignerPosition || '';
  data.common.ks3TechCustomerName ||= data.common.techCustomerSignerName || '';
  data.common.ks3ContractorPosition ||= data.common.contractorSignerPosition || 'Генеральный директор ООО «ЛегендаЭлит»';
  data.common.ks3ContractorName ||= data.common.contractorSignerName || 'А. Дылюк';

  data.ks2Sheets = (data.ks2Sheets || []).map((sheet, index) => {
    const prepared = {
      ...sheet,
      id: sheet.id || `ks2-${index + 1}`,
      rows: (sheet.rows || []).map((row) => ({
        ...row,
        type: row.type || 'item',
        calcMode: normalizeCalcMode(row.calcMode, row),
        expenseType: normalizeExpenseType(row.expenseType ?? row.typeZatr, row),
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
        fromStart: numberOrNull(row.fromStart),
        amountFromStart: numberOrNull(row.amountFromStart),
        baseFromStart: numberOrNull(row.baseFromStart),
        cumulativeAmount: numberOrNull(row.cumulativeAmount),
        quantityFromStart: numberOrNull(row.quantityFromStart),
        fromStartQuantity: numberOrNull(row.fromStartQuantity),
        cumulativeQuantity: numberOrNull(row.cumulativeQuantity),
      })),
    };

    prepared.rows.forEach((row) => {
      row.amount = computeRowDisplayAmount(row);
    });

    return prepared;
  });

  data.ks3.title ||= `КС-3 №${data.ks2Sheets[0]?.documentNumber || '1'}`;
  data.ks3.documentNumber ||= data.ks2Sheets[0]?.documentNumber || '1';
  data.ks3.documentDate ||= data.ks2Sheets[0]?.documentDate || new Date().toISOString().slice(0, 10);
  data.ks3.periodFrom ||= data.ks2Sheets[0]?.periodFrom || new Date().toISOString().slice(0, 10);
  data.ks3.periodTo ||= data.ks2Sheets[0]?.periodTo || new Date().toISOString().slice(0, 10);
  const legacyKs3Totals = data.ks3.totals || {};
  data.ks3.rows = (data.ks3.rows || []).map((row) => normalizeKs3Row(row));
  data.ks3.totals = {
    fromStart: numberOrNull(legacyKs3Totals.fromStart),
    fromYearStart: numberOrNull(legacyKs3Totals.fromYearStart ?? legacyKs3Totals.subtotal),
    forPeriod: numberOrNull(legacyKs3Totals.forPeriod ?? legacyKs3Totals.subtotal),
    vat: numberOrNull(legacyKs3Totals.vat),
  };

  data.holdbacks.rows = (data.holdbacks.rows || []).map((row) => {
    const kind = row.kind || row.type || 'section';
    const ks2Amount = numberOrZero(row.ks2Amount);
    const retentionAmount = numberOrZero(row.retentionAmount);
    const retentionRate = row.retentionRate ?? (ks2Amount ? round2((retentionAmount / ks2Amount) * 100) : 3);
    const explicitSheetId = row.ks2SheetId ?? row.linkedKs2SheetId ?? row.sheetId ?? '';
    return {
      ...row,
      kind,
      name: row.name ?? '',
      advanceDoc: row.advanceDoc ?? '',
      comment: row.comment ?? '',
      ks2SheetId: explicitSheetId || guessKs2SheetIdForHoldbackRow(row, data.ks2Sheets),
      ks2Amount: numberOrNull(row.ks2Amount),
      materialsUsed: numberOrNull(row.materialsUsed),
      advanceReceived: numberOrNull(row.advanceReceived),
      previousBalance: numberOrNull(row.previousBalance),
      closingAmount: numberOrNull(row.closingAmount),
      nextBalance: numberOrNull(row.nextBalance),
      retentionAmount: numberOrNull(row.retentionAmount),
      payableAmount: numberOrNull(row.payableAmount),
      retentionRate: numberOrNull(retentionRate),
      retentionDocName: row.retentionDocName ?? 'Дополнительное соглашение о гарантийном удержании',
      retentionDocNumber: row.retentionDocNumber ?? '',
      retentionDocDate: row.retentionDocDate ?? '',
      retentionDocExtra: row.retentionDocExtra ?? 'Гарантийное удержание 3% от стоимости работ',
    };
  });

  data.xmlExtras.generated.programVersion ||= 'prototype-0.1.0';

  return data;
}

function render() {
  applyUiPreferences();
  renderNavStrip();
  renderStatusbarControls();
  renderStats();
  renderContent();
  applyColumnWidths();
}

function applyUiPreferences() {
  document.body.dataset.scale = String(normalizeScale(app.state.ui.scale));
  document.body.dataset.density = app.state.ui.compactRows ? 'compact' : 'comfortable';

  if (refs.scaleReset) refs.scaleReset.textContent = `${normalizeScale(app.state.ui.scale)}%`;
  if (refs.densityCompact) refs.densityCompact.checked = Boolean(app.state.ui.compactRows);
  if (refs.toggleHeaders) {
    refs.toggleHeaders.textContent = app.state.common.showDocumentHeaders ? 'Шапки: вкл' : 'Шапки: выкл';
    refs.toggleHeaders.classList.toggle('is-active', Boolean(app.state.common.showDocumentHeaders));
  }
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

function hasTransientRowUi() {
  return Boolean(
    app.state.ui.rowActionMenu
    || app.state.ui.rowDeleteConfirm
    || app.state.ui.ks3RowActionMenu != null
    || app.state.ui.ks3RowDeleteConfirm != null
    || app.state.ui.sheetAddMenu != null
    || app.state.ui.holdbackActionMenu != null
    || app.state.ui.holdbackDeleteConfirm != null
    || app.state.ui.settlementAddMenu
    || app.state.ui.settlementDeleteConfirm != null
  );
}

function clearTransientRowUi() {
  app.state.ui.rowActionMenu = null;
  app.state.ui.rowDeleteConfirm = null;
  app.state.ui.ks3RowActionMenu = null;
  app.state.ui.ks3RowDeleteConfirm = null;
  app.state.ui.sheetAddMenu = null;
  app.state.ui.holdbackActionMenu = null;
  app.state.ui.holdbackDeleteConfirm = null;
  app.state.ui.settlementAddMenu = false;
  app.state.ui.settlementDeleteConfirm = null;
}

function applyColumnWidths() {
  const entries = Object.entries(app.state.ui.columnWidths || {});
  for (const [tableId, columns] of entries) {
    for (const [selector, width] of Object.entries(columns || {})) {
      refs.content.querySelectorAll(`table[data-table-id="${tableId}"] col.${selector}`).forEach((col) => {
        col.style.width = `${width}px`;
      });
    }
  }
}

function handleResizeStart(event) {
  const handle = event.target.closest('.resize-handle');
  if (!handle) return;
  event.preventDefault();

  const th = handle.closest('th');
  const table = handle.closest('table');
  if (!th || !table) return;

  const tableId = th.dataset.tableId;
  const selector = th.dataset.colSelector;
  const col = table.querySelector(`col.${selector}`);
  if (!tableId || !selector || !col) return;

  const startX = event.clientX;
  const startWidth = col.getBoundingClientRect().width;
  const minWidth = Number(th.dataset.minWidth || 40);

  const onMove = (moveEvent) => {
    const nextWidth = Math.max(minWidth, Math.round(startWidth + (moveEvent.clientX - startX)));
    app.state.ui.columnWidths[tableId] ??= {};
    app.state.ui.columnWidths[tableId][selector] = nextWidth;
    col.style.width = `${nextWidth}px`;
  };

  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function renderStatusbarControls() {
  const active = app.state.ui.activePane || 'requisites';
  const match = active.match(/^ks2:(\d+)$/);
  refs.ks2ViewSwitcherSlot.innerHTML = match ? renderKs2ViewSwitcher(Number(match[1])) : '';
}

function renderNavStrip() {
  const active = app.state.ui.activePane;
  const primaryButtons = [
    { pane: 'requisites', label: 'Реквизиты' },
    { pane: 'xml', label: 'XML' },
  ].map((item) => `
    <button class="nav-chip ${active === item.pane ? 'active' : ''}" data-pane="${item.pane}" title="${escapeAttr(item.label)}">${escapeHtml(item.label)}</button>
  `).join('');

  const ks2Buttons = app.state.ks2Sheets.map((sheet, index) => {
    const docNo = sheet.documentNumber || index + 1;
    const title = sheet.title || `Лист КС-2 #${index + 1}`;
    return `
      <button class="nav-chip ${active === `ks2:${index}` ? 'active' : ''}" data-pane="ks2:${index}" title="${escapeAttr(`${title} · №${docNo}`)}">КС-2 №${escapeHtml(String(docNo))}</button>
    `;
  }).join('');

  refs.navStrip.innerHTML = `
    <div class="nav-strip-group">
      ${primaryButtons}
    </div>
    <div class="nav-strip-divider"></div>
    <div class="nav-strip-group nav-strip-group-scroll">
      ${ks2Buttons}
    </div>
  `;
}

function renderStats() {
  const totalRows = app.state.ks2Sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
  const grossTotal = app.state.ks2Sheets.reduce((sum, sheet) => sum + computeSheetTotals(sheet).gross, 0);
  const validation = buildLogicBundle().validation;
  refs.stats.textContent = `${app.state.ks2Sheets.length} листов КС-2 · ${totalRows} строк · общая сумма с НДС: ${formatMoney(grossTotal)} · ошибок: ${validation.errors.length} · предупреждений: ${validation.warnings.length}`;
}

function renderContent() {
  const pane = app.state.ui.activePane;
  let html = '';

  if (pane === 'requisites') html = renderRequisitesPane();
  else if (pane === 'xml') html = renderXmlPane();
  else if (pane.startsWith('ks2:')) html = renderKs2Pane(Number(pane.split(':')[1]));
  else html = '<div class="panel"><div class="empty-state">Не удалось открыть выбранную вкладку.</div></div>';

  refs.content.innerHTML = html;
}

function buildLogicBundle() {
  const model = buildDocumentModel();
  const validation = buildValidationReport(model);
  return { model, validation };
}

function buildDocumentModel() {
  const ks2Sheets = app.state.ks2Sheets.map((sheet, sheetIndex) => {
    const totals = computeSheetTotals(sheet);
    const rows = sheet.rows.map((row, rowIndex) => ({
      rowIndex,
      type: row.type,
      calcMode: normalizeCalcMode(row.calcMode, row),
      correctionKind: getCorrectionKind(row),
      isCorrection: isCorrectionRow(row),
      expenseType: normalizeExpenseType(row.expenseType, row),
      code: row.code || '',
      lineNo: row.lineNo || '',
      estimateNo: row.estimateNo || '',
      name: row.name || '',
      unit: row.unit || '',
      quantity: numberOrNull(row.quantity),
      price: numberOrNull(row.price),
      amount: numberOrNull(computeRowDisplayAmount(row)),
      effectiveAmount: numberOrNull(computeRowEffectiveAmount(row)),
      effectiveQuantity: applyRowSign(numberOrNull(row.quantity), row),
      effectiveFromStart: applyRowSign(firstNumberOrNull(row.fromStart, row.amountFromStart, row.baseFromStart, row.cumulativeAmount), row),
      effectiveQuantityFromStart: applyRowSign(firstNumberOrNull(row.quantityFromStart, row.fromStartQuantity, row.cumulativeQuantity), row),
      unitConsumption: numberOrNull(row.unitConsumption),
      category: row.category || '',
      note: row.note || '',
      fromStart: numberOrNull(row.fromStart),
      amountFromStart: numberOrNull(row.amountFromStart),
      baseFromStart: numberOrNull(row.baseFromStart),
      cumulativeAmount: numberOrNull(row.cumulativeAmount),
      quantityFromStart: numberOrNull(row.quantityFromStart),
      fromStartQuantity: numberOrNull(row.fromStartQuantity),
      cumulativeQuantity: numberOrNull(row.cumulativeQuantity),
    }));
    return {
      sheetIndex,
      id: sheet.id || `ks2-${sheetIndex + 1}`,
      title: sheet.title,
      document: {
        number: sheet.documentNumber,
        date: sheet.documentDate,
        periodFrom: sheet.periodFrom,
        periodTo: sheet.periodTo,
        basis: sheet.basis,
        vatRate: numberOrZero(sheet.vatRate),
      },
      rows,
      items: rows.filter((row) => row.type === 'item'),
      totals,
    };
  });

  const ks3Rows = buildKs3Rows();
  const ks3Totals = buildKs3Totals(ks3Rows);

  const holdbackGroups = buildHoldbackGroups();
  const holdbacksRows = app.state.holdbacks.rows.map((row, rowIndex) => {
    const computed = computeHoldbackRow(row);
    return {
      rowIndex,
      ...clone(row),
      ...computed,
    };
  });

  const holdbackSections = holdbackGroups.map((group, sectionIndex) => {
    const computed = computeHoldbackSectionComputed(group);
    return {
      sectionIndex,
      rowIndex: group.section.index,
      ...clone(group.section.row),
      ...computed,
      subitems: group.subitems.map((item) => ({
        rowIndex: item.index,
        ...clone(item.row),
        ...computeHoldbackRow(item.row),
      })),
    };
  });

  const holdbacksTotals = holdbackSections.reduce((acc, row) => {
    acc.ks2Amount += numberOrZero(row.ks2Amount);
    acc.materialsUsed += numberOrZero(row.materialsUsed);
    acc.advanceReceived += numberOrZero(row.advanceReceived);
    acc.previousBalance += numberOrZero(row.previousBalance);
    acc.closingAmount += numberOrZero(row.closingAmount);
    acc.nextBalance += numberOrZero(row.nextBalance);
    acc.retentionAmount += numberOrZero(row.retentionAmount);
    acc.payableAmount += numberOrZero(row.payableAmount);
    return acc;
  }, { ks2Amount: 0, materialsUsed: 0, advanceReceived: 0, previousBalance: 0, closingAmount: 0, nextBalance: 0, retentionAmount: 0, payableAmount: 0 });

  const holdbacksXml = buildHoldbacksXmlSettlementModel();

  return {
    generatedAt: new Date().toISOString(),
    common: clone(app.state.common),
    ks2Sheets,
    ks3: {
      document: {},
      rows: [],
      totals: {},
    },
    holdbacks: {
      rows: holdbacksRows,
      sections: holdbackSections,
      totals: holdbacksTotals,
    },
    xml: {
      generated: buildGeneratedXmlFields(),
      constants: clone(app.state.xmlExtras.constants),
      manual: clone(app.state.xmlExtras.manual),
      traceableGoods: clone(app.state.xmlExtras.traceableGoods),
      settlement: holdbacksXml,
    },
  };
}

function buildValidationReport(model) {
  const errors = [];
  const warnings = [];
  const pushIssue = (severity, path, label, message) => {
    const target = severity === 'error' ? errors : warnings;
    target.push({ severity, path, label, message });
  };
  const requireValue = (value, path, label, severity = 'error') => {
    if (value == null || String(value).trim() === '') {
      pushIssue(severity, path, label, `${label} не заполнено`);
    }
  };

  requireValue(model.common.developerName, 'common.developerName', 'Застройщик');
  requireValue(model.common.developerOkpo, 'common.developerOkpo', 'ОКПО застройщика');
  requireValue(model.common.techCustomerName, 'common.techCustomerName', 'Технический заказчик');
  requireValue(model.common.techCustomerOkpo, 'common.techCustomerOkpo', 'ОКПО технического заказчика');
  requireValue(model.common.contractorName, 'common.contractorName', 'Генподрядчик');
  requireValue(model.common.contractorOkpo, 'common.contractorOkpo', 'ОКПО генподрядчика');
  requireValue(model.common.constructionObject, 'common.constructionObject', 'Стройка');
  requireValue(model.common.objectName, 'common.objectName', 'Объект');
  requireValue(model.common.contractNumber, 'common.contractNumber', 'Номер договора');
  requireValue(model.common.contractDate, 'common.contractDate', 'Дата договора');
  requireValue(model.common.operationType, 'common.operationType', 'Вид операции');
  requireValue(model.common.okudKs2, 'common.okudKs2', 'ОКУД КС-2');
  requireValue(model.common.objectOkpo, 'common.objectOkpo', 'ОКПО объекта', 'warning');
  requireValue(model.common.okdpCode, 'common.okdpCode', 'ОКДП', 'warning');

  model.ks2Sheets.forEach((sheet, index) => {
    const prefix = `ks2Sheets.${index}`;
    requireValue(sheet.document.number, `${prefix}.document.number`, `КС-2 #${index + 1}: номер документа`);
    requireValue(sheet.document.date, `${prefix}.document.date`, `КС-2 #${index + 1}: дата документа`);
    requireValue(sheet.document.periodFrom, `${prefix}.document.periodFrom`, `КС-2 #${index + 1}: период с`);
    requireValue(sheet.document.periodTo, `${prefix}.document.periodTo`, `КС-2 #${index + 1}: период по`);
    requireValue(sheet.document.basis, `${prefix}.document.basis`, `КС-2 #${index + 1}: основание`);
    if (!sheet.items.length) {
      pushIssue('error', `${prefix}.rows`, `КС-2 #${index + 1}`, 'В листе нет ни одной строки типа «работа»');
    }
    sheet.items.forEach((item, rowIndex) => {
      if (!item.name) pushIssue('warning', `${prefix}.rows.${rowIndex}.name`, `КС-2 #${index + 1}: строка ${rowIndex + 1}`, 'Не заполнено наименование работы');
      if (item.quantity == null) pushIssue('warning', `${prefix}.rows.${rowIndex}.quantity`, `КС-2 #${index + 1}: строка ${rowIndex + 1}`, 'Не заполнен объем');
      if (item.price == null) pushIssue('warning', `${prefix}.rows.${rowIndex}.price`, `КС-2 #${index + 1}: строка ${rowIndex + 1}`, 'Не заполнена цена');
    });
  });

  if (!model.holdbacks.rows.length) {
    pushIssue('warning', 'holdbacks.rows', 'Удержания', 'Нет ни одной строки удержаний');
  }

  if (model.ks2Sheets.length > 1) {
    model.holdbacks.sections.forEach((section, index) => {
      if (!String(section.ks2SheetId || '').trim()) {
        pushIssue('warning', `holdbacks.sections.${index}.ks2SheetId`, `Удержания: раздел ${index + 1}`, 'Для multi-KS2 лучше явно выбрать лист КС-2 у каждой строки удержаний, чтобы уйти от эвристики при per-sheet XML.');
      }
    });
  }

  requireValue(model.xml.manual.contractorInn, 'xml.manual.contractorInn', 'ИНН подрядчика', 'warning');
  requireValue(model.xml.manual.customerInn, 'xml.manual.customerInn', 'ИНН заказчика', 'warning');
  requireValue(model.xml.manual.economicSubjectName || model.common.contractorName, 'xml.manual.economicSubjectName', 'Составитель XML', 'warning');
  if (String(model.xml.manual.isCorrectionAct || '0') === '1') {
    requireValue(model.xml.manual.correctionNumber, 'xml.manual.correctionNumber', 'Исправление №', 'warning');
    requireValue(model.xml.manual.correctionDate, 'xml.manual.correctionDate', 'Дата исправления', 'warning');
  }

  if (String(model.xml.manual.hasEstimateChange || '1') === '1') {
    requireValue(model.xml.manual.estimateVersionCode, 'xml.manual.estimateVersionCode', 'Версия сметы (КодСмет)', 'warning');
    requireValue(model.xml.manual.supplementDocType, 'xml.manual.supplementDocType', 'Тип допсоглашения', 'warning');
    requireValue(model.xml.manual.supplementDocNumber, 'xml.manual.supplementDocNumber', 'Номер допсоглашения', 'warning');
    requireValue(model.xml.manual.supplementDocDate, 'xml.manual.supplementDocDate', 'Дата допсоглашения', 'warning');
  }
  requireValue(model.xml.manual.developerPostalIndex, 'xml.manual.developerPostalIndex', 'Индекс адреса', 'warning');
  requireValue(model.xml.manual.developerRegionCode, 'xml.manual.developerRegionCode', 'Код региона', 'warning');
  requireValue(model.xml.manual.signerName || model.common.contractorSignerName, 'xml.manual.signerName', 'Подписант XML: ФИО', 'warning');

  const manualSettlementRows = model.xml.settlement?.manualRows || [];
  manualSettlementRows.forEach((row, index) => {
    const hasContent = numberOrZero(row.amount) > 0 || row.documentRef || row.comment || row.customKindText;
    if (!hasContent) return;
    if (row.amount == null || numberOrZero(row.amount) <= 0) {
      pushIssue('warning', `xml.settlement.manualRows.${index}.amount`, `СвОРасч: строка ${index + 1}`, 'Для typed-строки ВидТреб / ВидУдерж нужна сумма больше 0');
    }
    if (isSettlementOtherCode(row) && !String(row.customKindText || '').trim()) {
      pushIssue('warning', `xml.settlement.manualRows.${index}.customKindText`, `СвОРасч: строка ${index + 1}`, `Для кода ${row.kind === 'claim' ? '05' : '36'} нужно заполнить поле «Иной вид»`);
    }
    if (row.isPrimary && (row.amount == null || numberOrZero(row.amount) <= 0)) {
      pushIssue('warning', `xml.settlement.manualRows.${index}.isPrimary`, `СвОРасч: строка ${index + 1}`, 'Эта строка отмечена как основная для XSD-ready, но без суммы она не попадет в экспорт.');
    }
  });

  const representativeRow = model.xml.settlement?.representativeRow || null;
  const xmlSettlementRows = model.xml.settlement?.settlementRows || [];
  const distinctSettlementKinds = new Set(xmlSettlementRows.map((row) => `${normalizeSettlementKind(row.kind)}:${normalizeSettlementCode(row.kind, row.kindCode)}`));
  if (distinctSettlementKinds.size > 1) {
    pushIssue('warning', 'xml.settlement.settlementRows', 'СвОРасч', `В текущем XSD-ready профиле несколько видов требований / удержаний будут сжаты в один УчетТребУдерж. Сейчас основной строкой выбрана: ${buildRepresentativeSettlementLabel(representativeRow)}.`);
  }

  return {
    errors,
    warnings,
    readyForExport: errors.length === 0,
  };
}

function renderValidationIssue(issue) {
  return `<li class="issue-item ${issue.severity}"><strong>${escapeHtml(issue.label)}:</strong> ${escapeHtml(issue.message)}</li>`;
}

function renderRequisitesPane() {
  const c = app.state.common;
  const totals = app.state.ks2Sheets.map(computeSheetTotals);
  const totalGross = totals.reduce((sum, sheet) => sum + sheet.gross, 0);
  const totalVat = totals.reduce((sum, sheet) => sum + sheet.vat, 0);
  const totalBase = totalGross - totalVat;
  const logic = buildLogicBundle();

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
        <h3>Логика формы и проверка обязательных полей</h3>
        <div class="summary-grid">
          <div class="summary-card"><span>Ошибки</span><strong>${logic.validation.errors.length}</strong></div>
          <div class="summary-card"><span>Предупреждения</span><strong>${logic.validation.warnings.length}</strong></div>
          <div class="summary-card"><span>Готовность к экспорту</span><strong>${logic.validation.readyForExport ? 'Да' : 'Нет'}</strong></div>
          <div class="summary-card"><span>Логическая модель</span><strong>${logic.model.ks2Sheets.length + 2} док.</strong></div>
        </div>
        <div class="card-grid section-block">
          <div class="info-card">
            <span class="label">Критичные ошибки</span>
            ${logic.validation.errors.length ? `<ul class="issue-list">${logic.validation.errors.slice(0, 8).map(renderValidationIssue).join('')}</ul>` : '<div class="logic-ok">Критичных ошибок пока нет.</div>'}
          </div>
          <div class="info-card">
            <span class="label">Предупреждения</span>
            ${logic.validation.warnings.length ? `<ul class="issue-list">${logic.validation.warnings.slice(0, 8).map(renderValidationIssue).join('')}</ul>` : '<div class="logic-ok">Предупреждений пока нет.</div>'}
          </div>
        </div>
      </div>

      <div class="section-block">
        <h3>Коды формы и договор</h3>
        <div class="form-grid">
          ${renderInput('ОКУД КС-2', 'common.okudKs2', c.okudKs2, 'string', 'quarter')}
          ${renderInput('ОКУД КС-3', 'common.okudKs3', c.okudKs3, 'string', 'quarter')}
          ${renderInput('ОКПО объекта', 'common.objectOkpo', c.objectOkpo, 'string', 'quarter')}
          ${renderInput('ОКДП', 'common.okdpCode', c.okdpCode, 'string', 'quarter')}
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

      <div class="section-block">
        <h3>Названия документов</h3>
        <div class="form-grid">
          ${renderInput('КС-2: заголовок', 'common.ks2DocLabel', c.ks2DocLabel, 'string', 'quarter')}
          ${renderInput('КС-2: подзаголовок', 'common.ks2DocSubtitle', c.ks2DocSubtitle, 'string', 'half')}
          ${renderInput('КС-3: заголовок', 'common.ks3DocLabel', c.ks3DocLabel, 'string', 'quarter')}
          ${renderInput('КС-3: подзаголовок', 'common.ks3DocSubtitle', c.ks3DocSubtitle, 'string', 'half')}
        </div>
      </div>

      <div class="section-block">
        <h3>Подписанты и нижние блоки документов</h3>
        <p>Эти поля дублируются внизу КС-2, КС-3 и листа удержаний. Показ самих подписей включается кнопкой сверху.</p>
        <div class="form-grid">
          ${renderInput('КС-2: Сдал — заголовок', 'common.contractorSignLabel', c.contractorSignLabel, 'string', 'quarter')}
          ${renderTextarea('КС-2: Сдал — должность', 'common.contractorSignerPosition', c.contractorSignerPosition, 'half')}
          ${renderInput('КС-2: Сдал — ФИО', 'common.contractorSignerName', c.contractorSignerName, 'string', 'quarter')}

          ${renderInput('КС-2: Принял — заголовок', 'common.customerSignLabel', c.customerSignLabel, 'string', 'quarter')}
          ${renderTextarea('КС-2: Принял — должность', 'common.ks2AcceptedPosition', c.ks2AcceptedPosition, 'half')}
          ${renderInput('КС-2: Принял — ФИО', 'common.ks2AcceptedName', c.ks2AcceptedName, 'string', 'quarter')}

          ${renderInput('КС-2: Проверил — заголовок', 'common.ks2CheckedLabel', c.ks2CheckedLabel, 'string', 'quarter')}
          ${renderTextarea('КС-2: Проверил — должность', 'common.ks2CheckedPosition', c.ks2CheckedPosition, 'half')}
          ${renderInput('КС-2: Проверил — ФИО', 'common.ks2CheckedName', c.ks2CheckedName, 'string', 'quarter')}

          ${renderTextarea('КС-3 / Удержания: Застройщик — должность', 'common.ks3DeveloperPosition', c.ks3DeveloperPosition, 'half')}
          ${renderInput('КС-3 / Удержания: Застройщик — ФИО', 'common.ks3DeveloperName', c.ks3DeveloperName, 'string', 'quarter')}
          ${renderTextarea('КС-3 / Удержания: Техзаказчик — должность', 'common.ks3TechCustomerPosition', c.ks3TechCustomerPosition, 'half')}
          ${renderInput('КС-3 / Удержания: Техзаказчик — ФИО', 'common.ks3TechCustomerName', c.ks3TechCustomerName, 'string', 'quarter')}
          ${renderTextarea('КС-3 / Удержания: Генподрядчик — должность', 'common.ks3ContractorPosition', c.ks3ContractorPosition, 'half')}
          ${renderInput('КС-3 / Удержания: Генподрядчик — ФИО', 'common.ks3ContractorName', c.ks3ContractorName, 'string', 'quarter')}
        </div>
      </div>
    </div>
  `;
}

function renderExcelDocFrame({ formTitle, docLabel = '', docSubtitle = '', formCodeLabel = 'Форма по ОКУД', formCode, common, contractLabel = 'Договор генподряда', docKindLabel = 'Номер документа / дата / период', documentNumber, documentDate, periodFrom, periodTo, basis, objectLabel = 'Объект' }) {
  return `
    <div class="excel-frame">
      <div class="excel-frame-top">
        <div>
          <div class="excel-frame-caption">Унифицированная форма</div>
          <div class="excel-frame-title">${escapeHtml(docLabel || formTitle)}</div>
          <div class="excel-frame-subtitle">${escapeHtml(docSubtitle || 'Утверждена постановлением Госкомстата России от 11.11.99 № 100')}</div>
        </div>
        <div class="excel-code-box">
          <span>${escapeHtml(formCodeLabel)}</span>
          <strong>${escapeHtml(formCode || '')}</strong>
        </div>
      </div>

      <div class="excel-org-list">
        ${renderExcelPartyLine('Застройщик', common.developerName, common.developerOkpo)}
        ${renderExcelPartyLine('Технический заказчик', common.techCustomerName, common.techCustomerOkpo)}
        ${renderExcelPartyLine('Генподрядчик', common.contractorName, common.contractorOkpo)}
        ${renderExcelSimpleLine('Стройка', common.constructionObject, 'наименование, адрес')}
        ${renderExcelPartyLine(objectLabel, common.objectName, common.objectOkpo)}
        ${renderExcelSimpleLine('Вид деятельности по ОКДП', common.okdpCode, '')}
      </div>

      <div class="excel-meta-grid">
        <div class="excel-meta-cell">
          <span class="excel-meta-label">${escapeHtml(contractLabel)}</span>
          <strong>${escapeHtml(common.contractNumber || '')}</strong>
          <em>${escapeHtml(common.contractDate || '')}</em>
        </div>
        <div class="excel-meta-cell">
          <span class="excel-meta-label">Вид операции</span>
          <strong>${escapeHtml(common.operationType || '')}</strong>
        </div>
        <div class="excel-meta-cell excel-meta-cell-wide">
          <span class="excel-meta-label">${escapeHtml(docKindLabel)}</span>
          <strong>№ ${escapeHtml(documentNumber || '')} · ${escapeHtml(documentDate || '')}</strong>
          <em>${escapeHtml(periodFrom || '')} — ${escapeHtml(periodTo || '')}</em>
        </div>
      </div>

      ${basis ? `
        <div class="excel-basis-row">
          <span class="excel-basis-label">Основание:</span>
          <div class="excel-basis-value">${escapeHtml(basis)}</div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderExcelPartyLine(label, value, okpo) {
  return `
    <div class="excel-line">
      <div class="excel-line-main">
        <span class="excel-line-label">${escapeHtml(label)}:</span>
        <span class="excel-line-value">${escapeHtml(value || '')}</span>
      </div>
      <div class="excel-line-side">
        <span class="excel-line-side-label">по ОКПО</span>
        <strong>${escapeHtml(okpo || '')}</strong>
      </div>
    </div>
  `;
}

function renderExcelSimpleLine(label, value, hint = '') {
  return `
    <div class="excel-line excel-line-simple">
      <div class="excel-line-main">
        <span class="excel-line-label">${escapeHtml(label)}:</span>
        <span class="excel-line-value">${escapeHtml(value || '')}</span>
      </div>
      ${hint ? `<div class="excel-line-hint">${escapeHtml(hint)}</div>` : ''}
    </div>
  `;
}

function renderSignatureRow(label, position, name) {
  return `
    <div class="signature-excel-block">
      <div class="signature-excel-main">
        <div class="signature-role">${escapeHtml(label)}</div>
        <div class="signature-position-wide">${escapeHtml(position || '')}</div>
        <div class="signature-sign-line"></div>
        <div class="signature-name-wide">${escapeHtml(name || '')}</div>
      </div>
      <div class="signature-excel-hints">
        <div></div>
        <div class="signature-mark">(должность)</div>
        <div class="signature-mark">(подпись)</div>
        <div class="signature-mark">(расшифровка подписи)</div>
      </div>
      <div class="signature-excel-stamp">
        <div></div>
        <div class="signature-stamp">М.П.</div>
        <div></div>
        <div></div>
      </div>
    </div>
  `;
}

function renderKs2TotalsBlock(sheet, totals) {
  const workAmount = round2((totals.breakdown.work || 0) + (totals.breakdown.frame || 0));
  const breakdownRows = [
    ['материал, в т.ч.:', totals.breakdown.material || 0],
    ['металлопрокат', totals.breakdown.metal || 0],
    ['бетон', totals.breakdown.concrete || 0],
    ['пр.мат.', totals.breakdown.misc || 0],
    ['работа', workAmount],
  ];
  return `
    <div class="ks2-footer-grid">
      <div class="excel-totals-block">
        <div class="excel-total-line">
          <span>ВСЕГО по Акту:</span>
          <strong>${formatMoney(totals.gross)}</strong>
        </div>
        <div class="excel-total-line">
          <span>в том числе НДС (${sheet.vatRate}%)</span>
          <strong>${formatMoney(totals.vat)}</strong>
        </div>
      </div>
      <div class="ks2-breakdown-block">
        ${breakdownRows.map(([label, amount]) => `
          <div class="ks2-breakdown-row">
            <span>${escapeHtml(label)}</span>
            <strong>${formatMoney(amount)}</strong>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function inferKs3VatRate(totals, vat) {
  const period = numberOrZero(totals?.forPeriod);
  const vatValue = numberOrZero(vat);
  if (period > 0 && vatValue >= 0) {
    const rate = round2((vatValue / period) * 100);
    if (rate > 0) return rate;
  }
  return app.state.ks2Sheets[0]?.vatRate || 20;
}

function renderKs3TotalsBlock(totals, vat) {
  const vatRate = inferKs3VatRate(totals, vat);
  const withVat = numberOrZero(totals.forPeriod) + numberOrZero(vat);
  return `
    <div class="excel-totals-block">
      <div class="excel-total-line"><span>Итого:</span><strong>${formatMoney(totals.forPeriod)}</strong></div>
      <div class="excel-total-line"><span>Сумма НДС (${formatMoney(vatRate).replace('.00', '').replace(',00', '')}%)</span><strong>${formatMoney(vat)}</strong></div>
      <div class="excel-total-line"><span>Всего с учетом НДС (${formatMoney(vatRate).replace('.00', '').replace(',00', '')}%):</span><strong>${formatMoney(withVat)}</strong></div>
    </div>
  `;
}

function renderHoldbacksTotalsBlock(totals) {
  const vat = (value) => round2(numberOrZero(value) * 22 / 122);
  const valueColumns = [
    totals.ks2Amount,
    totals.materialsUsed,
    totals.advanceReceived,
    totals.previousBalance,
    totals.closingAmount,
    totals.nextBalance,
    totals.retentionAmount,
    totals.payableAmount,
  ];
  return `
    <div class="holdbacks-totals-grid">
      <div class="holdbacks-total-row holdbacks-total-head">
        <span>Всего:</span>
        ${valueColumns.map((value) => `<strong>${formatMoney(value)}</strong>`).join('')}
      </div>
      <div class="holdbacks-total-row">
        <span>в том числе НДС 22%</span>
        ${valueColumns.map((value) => `<strong>${formatMoney(vat(value))}</strong>`).join('')}
      </div>
    </div>
  `;
}

function renderKs2SignatureTable(common) {
  return `
    <div class="signature-table">
      ${renderSignatureRow(common.contractorSignLabel || 'Сдал', common.contractorSignerPosition, common.contractorSignerName)}
      ${renderSignatureRow(common.customerSignLabel || 'Принял', common.ks2AcceptedPosition, common.ks2AcceptedName)}
      ${renderSignatureRow(common.ks2CheckedLabel || 'Проверил', common.ks2CheckedPosition, common.ks2CheckedName)}
    </div>
  `;
}

function renderKs3SignatureTable(common) {
  return `
    <div class="signature-table">
      ${renderSignatureRow('Застройщик', common.ks3DeveloperPosition, common.ks3DeveloperName)}
      ${renderSignatureRow('Технический Заказчик', common.ks3TechCustomerPosition, common.ks3TechCustomerName)}
      ${renderSignatureRow('Генподрядчик', common.ks3ContractorPosition, common.ks3ContractorName)}
    </div>
  `;
}

function renderKs2RowActions(sheetIndex, rowIndex) {
  const menuOpen = app.state.ui.rowActionMenu
    && app.state.ui.rowActionMenu.sheetIndex === sheetIndex
    && app.state.ui.rowActionMenu.rowIndex === rowIndex;
  const confirmOpen = app.state.ui.rowDeleteConfirm
    && app.state.ui.rowDeleteConfirm.sheetIndex === sheetIndex
    && app.state.ui.rowDeleteConfirm.rowIndex === rowIndex;

  return `
    <div class="row-action-stack">
      <button class="stack-button add" title="Добавить строку ниже" aria-label="Добавить строку ниже" data-action="toggle-row-menu" data-sheet-index="${sheetIndex}" data-row-index="${rowIndex}">+</button>
      <button class="stack-button remove" title="Удалить строку" aria-label="Удалить строку" data-action="prompt-delete-row" data-sheet-index="${sheetIndex}" data-row-index="${rowIndex}">×</button>
      ${menuOpen ? `
        <div class="row-action-menu">
          <button class="row-action-menu-item" data-action="insert-row-after" data-row-kind="section" data-sheet-index="${sheetIndex}" data-row-index="${rowIndex}">+ Раздел</button>
          ${renderExpenseTypeMenuItems(sheetIndex, rowIndex)}
          <button class="row-action-menu-item" data-action="insert-row-after" data-row-kind="errorCorrection" data-expense-type="1" data-sheet-index="${sheetIndex}" data-row-index="${rowIndex}">+ Испр. ошибок</button>
          <button class="row-action-menu-item" data-action="insert-row-after" data-row-kind="newCircumstances" data-expense-type="1" data-sheet-index="${sheetIndex}" data-row-index="${rowIndex}">+ Новые обстоятельства</button>
          <button class="row-action-menu-item" data-action="insert-row-after" data-row-kind="note" data-sheet-index="${sheetIndex}" data-row-index="${rowIndex}">+ Примечание</button>
        </div>
      ` : ''}
      ${confirmOpen ? `
        <div class="row-action-confirm">
          <div class="row-action-confirm-title">Удалить?</div>
          <div class="row-action-confirm-buttons">
            <button class="confirm-icon confirm-yes" title="Подтвердить" aria-label="Подтвердить" data-action="confirm-delete-row" data-sheet-index="${sheetIndex}" data-row-index="${rowIndex}">✓</button>
            <button class="confirm-icon confirm-no" title="Отмена" aria-label="Отмена" data-action="cancel-delete-row" data-sheet-index="${sheetIndex}" data-row-index="${rowIndex}">×</button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

async function loadKs2XmlPreview(sheetIndex, force = false) {
  const cacheKey = String(sheetIndex);
  const current = app.state.ui.ks2XmlPreview?.[cacheKey];
  if (!force && current?.status === 'ready') return;

  app.state.ui.ks2XmlPreview[cacheKey] = { status: 'loading' };
  render();

  try {
    const response = await fetch('/api/preview-xml-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: buildLogicBundle().model, sheetIndex }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || `Ошибка ${response.status}`);
    app.state.ui.ks2XmlPreview[cacheKey] = {
      status: 'ready',
      filename: data.filename,
      valid: Boolean(data.valid),
      errors: data.errors || [],
      xmlText: data.xmlText || '',
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    app.state.ui.ks2XmlPreview[cacheKey] = {
      status: 'error',
      error: error.message,
    };
  }
  render();
}

function renderKs2ViewSwitcher(sheetIndex) {
  const mode = app.state.ui.ks2ViewMode?.[sheetIndex] || 'form';
  return `
    <div class="view-switcher">
      <button class="mini ${mode === 'form' ? '' : 'secondary'}" data-action="set-ks2-view-mode" data-sheet-index="${sheetIndex}" data-mode="form">Форма</button>
      <button class="mini ${mode === 'xml' ? '' : 'secondary'}" data-action="set-ks2-view-mode" data-sheet-index="${sheetIndex}" data-mode="xml">XML</button>
    </div>
  `;
}


function extractXmlBlock(xmlText, tagName) {
  if (!xmlText) return '';
  const start = xmlText.indexOf(`<${tagName}`);
  const endTag = `</${tagName}>`;
  const end = xmlText.indexOf(endTag);
  if (start === -1 || end === -1) return '';
  return xmlText.slice(start, end + endTag.length).trim();
}

function buildHoldbackSheetSummary(groups) {
  return groups.reduce((acc, group) => {
    const computed = computeHoldbackSectionComputed(group);
    acc.workAmount += numberOrZero(group.section.row.ks2Amount);
    acc.guaranteeAmount += numberOrZero(computed.retentionAmount);
    acc.advanceClosing += numberOrZero(computed.closingAmount);
    acc.payableAmount += numberOrZero(computed.payableAmount);
    if (!acc.retentionDocName && (group.section.row.retentionDocName || group.section.row.retentionDocNumber || group.section.row.retentionDocDate)) {
      acc.retentionDocName = group.section.row.retentionDocName || '';
      acc.retentionDocNumber = group.section.row.retentionDocNumber || '';
      acc.retentionDocDate = group.section.row.retentionDocDate || '';
      acc.retentionDocExtra = group.section.row.retentionDocExtra || '';
    }
    return acc;
  }, {
    workAmount: 0,
    guaranteeAmount: 0,
    advanceClosing: 0,
    payableAmount: 0,
    retentionDocName: '',
    retentionDocNumber: '',
    retentionDocDate: '',
    retentionDocExtra: '',
  });
}

function renderHoldbackSheetSummary(summary) {
  const formula = `${formatMoney(summary.workAmount)} − ${formatMoney(summary.guaranteeAmount)} − ${formatMoney(summary.advanceClosing)} = ${formatMoney(summary.payableAmount)}`;
  const docParts = [summary.retentionDocName, summary.retentionDocNumber, summary.retentionDocDate, summary.retentionDocExtra].filter(Boolean);
  return `
    <div class="holdback-summary-block section-block">
      <div class="panel-header holdback-summary-header">
        <div>
          <h3>Как сейчас собирается СвОРасч</h3>
          <p class="kbd-note">Итог к оплате считается как сумма работ по листу КС-2 минус гарантийное удержание минус все суммы закрытия по платежкам.</p>
        </div>
      </div>
      <div class="summary-grid settlement-summary-grid">
        <div class="summary-card"><span>Сумма работ по КС-2</span><strong>${formatMoney(summary.workAmount)}</strong></div>
        <div class="summary-card"><span>Гарантийное удержание 32</span><strong>${formatMoney(summary.guaranteeAmount)}</strong></div>
        <div class="summary-card"><span>Закрытие авансов 31</span><strong>${formatMoney(summary.advanceClosing)}</strong></div>
        <div class="summary-card"><span>Итого к оплате</span><strong>${formatMoney(summary.payableAmount)}</strong></div>
      </div>
      <div class="settlement-preview ${docParts.length ? '' : 'muted'}">
        <strong>Формула:</strong>
        <span>${formula}</span>
        ${docParts.length ? `<br /><strong>Документ по 32:</strong> ${escapeHtml(docParts.join(' · '))}` : ''}
      </div>
    </div>
  `;
}

function renderKs2XmlPreviewPane(sheetIndex, sheet) {
  const preview = app.state.ui.ks2XmlPreview?.[String(sheetIndex)] || null;
  if (!preview || preview.status === 'loading') {
    return `
      <div class="section-block xml-preview-block">
        <div class="xml-preview-header">
          <div>
            <h3>XML по листу КС-2</h3>
            <p class="kbd-note">Показывает, как текущий лист будет передан в отдельный XML.</p>
          </div>
          <button class="mini secondary" data-action="refresh-ks2-xml-preview" data-sheet-index="${sheetIndex}">Обновить XML</button>
        </div>
        <div class="xml-preview-status">${preview?.status === 'loading' ? 'Собираю XML…' : 'Открой вкладку XML, чтобы собрать XML по этому листу.'}</div>
      </div>
    `;
  }

  if (preview.status === 'error') {
    return `
      <div class="section-block xml-preview-block">
        <div class="xml-preview-header">
          <div>
            <h3>XML по листу КС-2</h3>
            <p class="kbd-note">Показывает, как текущий лист будет передан в отдельный XML.</p>
          </div>
          <button class="mini secondary" data-action="refresh-ks2-xml-preview" data-sheet-index="${sheetIndex}">Повторить</button>
        </div>
        <div class="xml-preview-status error">Не удалось собрать XML: ${escapeHtml(preview.error || 'неизвестная ошибка')}</div>
      </div>
    `;
  }

  const settlementBlock = extractXmlBlock(preview.xmlText || '', 'СвОРасч');

  return `
    <div class="section-block xml-preview-block">
      <div class="xml-preview-header">
        <div>
          <h3>XML по листу КС-2</h3>
          <p class="kbd-note">Это итоговый XML, который уйдет по листу <strong>${escapeHtml(sheet.title || `КС-2 #${sheetIndex + 1}`)}</strong>. Файл: <code>${escapeHtml(preview.filename || '')}</code>.</p>
        </div>
        <button class="mini secondary" data-action="refresh-ks2-xml-preview" data-sheet-index="${sheetIndex}">Обновить XML</button>
      </div>
      <div class="xml-preview-meta ${preview.valid ? 'valid' : 'invalid'}">
        <strong>${preview.valid ? 'XSD: OK' : 'XSD: есть ошибки'}</strong>
        <span>${preview.updatedAt ? `Обновлено: ${new Date(preview.updatedAt).toLocaleTimeString('ru-RU')}` : ''}</span>
      </div>
      ${preview.errors?.length ? `<div class="xml-preview-errors">${preview.errors.map((err) => `<div>строка ${err.line}: ${escapeHtml(err.message)}</div>`).join('')}</div>` : ''}
      ${settlementBlock ? `
        <div class="xml-preview-focus-block">
          <div class="xml-preview-focus-title">Финальный блок СвОРасч</div>
          <pre class="xml-preview-code xml-preview-code-compact"><code>${escapeHtml(settlementBlock)}</code></pre>
        </div>
      ` : ''}
      <pre class="xml-preview-code"><code>${escapeHtml(preview.xmlText || '')}</code></pre>
    </div>
  `;
}

function renderKs2Pane(sheetIndex) {
  const sheet = app.state.ks2Sheets[sheetIndex];
  if (!sheet) return '<div class="panel"><div class="empty-state">Лист КС-2 не найден.</div></div>';
  const totals = computeSheetTotals(sheet);
  const ks2TableId = `ks2-${sheetIndex}`;
  const viewMode = app.state.ui.ks2ViewMode?.[sheetIndex] || 'form';

  const rows = sheet.rows.map((row, rowIndex) => `
    <tr class="${row.type === 'section' ? 'section-row' : row.type === 'note' ? 'note-row' : isCorrectionRow(row) ? 'correction-row' : ''}">
      <td>${renderTableSelect(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.type`, row.type, { item: 'Строка', section: 'Раздел', note: 'Примечание' })}</td>
      <td>${renderTableInput(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.code`, row.code)}</td>
      <td>${renderTableInput(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.lineNo`, row.lineNo)}</td>
      <td>${renderTableInput(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.estimateNo`, row.estimateNo)}</td>
      <td>${renderTableTextarea(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.name`, row.name)}</td>
      <td>${renderTableInput(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.unit`, row.unit)}</td>
      <td class="number-cell">${renderTableInput(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.quantity`, formatEditableNumber(row.quantity), 'number')}</td>
      <td class="number-cell">${renderTableInput(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.price`, formatEditableNumber(row.price), 'number')}</td>
      <td class="amount-cell">${renderTableComputed(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.__displayAmount`, `
        <div class="amount-stack">
          <strong>${formatMoney(computeRowDisplayAmount(row))}</strong>
          ${isCorrectionRow(row) ? `<span class="calc-mode-chip subtract">${correctionModeLabel(row)}</span>` : ''}
        </div>
      `)}</td>
      <td class="number-cell">${renderTableInput(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.unitConsumption`, formatEditableNumber(row.unitConsumption), 'number')}</td>
      <td>${renderTableSelect(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.category`, row.category, {
            work: 'Работа',
            metal: 'Металлопрокат',
            frame: 'Каркас',
            concrete: 'Бетон',
            misc: 'Прочее',
            material: 'Материал',
          })}</td>
      <td>
        ${row.type === 'item'
          ? renderTableSelect(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.expenseType`, normalizeExpenseType(row.expenseType, row), EXPENSE_TYPE_OPTIONS)
          : renderTableComputed(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.expenseType`, '<div class="table-muted-cell">—</div>')}
      </td>
      <td>
        ${row.type === 'item'
          ? renderTableSelect(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.calcMode`, normalizeCalcMode(row.calcMode, row), {
              normal: 'Обычная',
              errorCorrection: 'Исправление ошибок',
              newCircumstances: 'Новые обстоятельства',
            })
          : renderTableComputed(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.calcMode`, '<div class="table-muted-cell">—</div>')}
      </td>
      <td>${renderTableTextarea(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.note`, row.note)}</td>
      <td class="actions-cell">${renderKs2RowActions(sheetIndex, rowIndex)}</td>
    </tr>
  `).join('');

  return `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">${escapeHtml(sheet.title)}</h2>
          <p class="panel-subtitle">Таблица построена по структуре Excel: шапка акта, основание, разделы, строки работ и итоговый блок.</p>
        </div>
        <div class="inline-actions ks2-header-actions">
          <button class="secondary" data-action="duplicate-sheet" data-sheet-index="${sheetIndex}">Дублировать лист</button>
          <button class="icon-button danger" title="Удалить лист" aria-label="Удалить лист" data-action="delete-sheet" data-sheet-index="${sheetIndex}">×</button>
        </div>
      </div>

      ${app.state.common.showDocumentHeaders ? renderExcelDocFrame({
        formTitle: '№ КС-2 · О приемке выполненных работ',
        docLabel: app.state.common.ks2DocLabel,
        docSubtitle: app.state.common.ks2DocSubtitle,
        formCode: app.state.common.okudKs2,
        common: app.state.common,
        documentNumber: sheet.documentNumber,
        documentDate: sheet.documentDate,
        periodFrom: sheet.periodFrom,
        periodTo: sheet.periodTo,
        basis: sheet.basis,
      }) : ''}

      <div class="summary-grid">
        <div class="summary-card"><span>Сумма с НДС</span><strong>${formatMoney(totals.gross)}</strong></div>
        <div class="summary-card"><span>НДС (${sheet.vatRate}%)</span><strong>${formatMoney(totals.vat)}</strong></div>
        <div class="summary-card"><span>Без НДС</span><strong>${formatMoney(totals.base)}</strong></div>
        <div class="summary-card"><span>Строки работ</span><strong>${sheet.rows.filter((row) => row.type === 'item').length}</strong></div>
      </div>

      <div class="breakdown-list">
        ${Object.entries(totals.breakdown).map(([label, amount]) => `<span class="breakdown-chip">${categoryLabel(label)}: ${formatMoney(amount)}</span>`).join('')}
      </div>

      ${viewMode === 'xml' ? renderKs2XmlPreviewPane(sheetIndex, sheet) : `
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
            <table class="table table-ks2" data-table-id="${ks2TableId}">
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
                <col class="ks2-col-expense" />
                <col class="ks2-col-mode" />
                <col class="ks2-col-note" />
                <col class="ks2-col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th data-table-id="${ks2TableId}" data-col-selector="ks2-col-type" data-min-width="60">Тип строки<span class="resize-handle"></span></th>
                  <th data-table-id="${ks2TableId}" data-col-selector="ks2-col-code" data-min-width="64">Код<span class="resize-handle"></span></th>
                  <th data-table-id="${ks2TableId}" data-col-selector="ks2-col-line" data-min-width="42">№ п/п<span class="resize-handle"></span></th>
                  <th data-table-id="${ks2TableId}" data-col-selector="ks2-col-estimate" data-min-width="42">№ п/п по смете<span class="resize-handle"></span></th>
                  <th data-table-id="${ks2TableId}" data-col-selector="ks2-col-name" data-min-width="220">Наименование работ и затрат<span class="resize-handle"></span></th>
                  <th data-table-id="${ks2TableId}" data-col-selector="ks2-col-unit" data-min-width="54">Ед. изм.<span class="resize-handle"></span></th>
                  <th data-table-id="${ks2TableId}" data-col-selector="ks2-col-qty" data-min-width="70">Объем<span class="resize-handle"></span></th>
                  <th data-table-id="${ks2TableId}" data-col-selector="ks2-col-price" data-min-width="90">Цена за ед., руб. с НДС<span class="resize-handle"></span></th>
                  <th data-table-id="${ks2TableId}" data-col-selector="ks2-col-amount" data-min-width="96">Общая стоимость, руб. с НДС<span class="resize-handle"></span></th>
                  <th data-table-id="${ks2TableId}" data-col-selector="ks2-col-consumption" data-min-width="42">Расход на единицу<span class="resize-handle"></span></th>
                  <th data-table-id="${ks2TableId}" data-col-selector="ks2-col-category" data-min-width="90">Категория<span class="resize-handle"></span></th>
                  <th data-table-id="${ks2TableId}" data-col-selector="ks2-col-expense" data-min-width="150">Тип затрат<span class="resize-handle"></span></th>
                  <th data-table-id="${ks2TableId}" data-col-selector="ks2-col-mode" data-min-width="96">Режим строки<span class="resize-handle"></span></th>
                  <th data-table-id="${ks2TableId}" data-col-selector="ks2-col-note" data-min-width="120">Примечание<span class="resize-handle"></span></th>
                  <th data-table-id="${ks2TableId}" data-col-selector="ks2-col-actions" data-min-width="24"><span class="resize-handle"></span></th>
                </tr>
                <tr class="numbering-row">
                  <th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th><th>8</th><th>9</th><th>10</th><th>11</th><th>12</th><th>13</th><th>14</th><th></th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>

        ${renderHoldbacksPane(sheetIndex)}
        ${renderKs2TotalsBlock(sheet, totals)}
        ${app.state.common.showDocumentSignatures ? renderKs2SignatureTable(app.state.common) : ''}
      `}
    </div>
  `;
}

function renderHoldbackRowActions(rowIndex, rowKind) {
  const effectiveIndex = rowKind === 'subitem' ? findHoldbackSectionIndex(rowIndex) : rowIndex;
  const menuOpen = app.state.ui.holdbackActionMenu === rowIndex;
  const confirmDelete = app.state.ui.holdbackDeleteConfirm === rowIndex;
  return `
    <div class="row-action-stack">
      <button class="stack-button add" title="Добавить" aria-label="Добавить" data-action="open-holdback-menu" data-hold-index="${effectiveIndex}">+</button>
      <button class="stack-button danger" title="Удалить строку" aria-label="Удалить строку" data-action="request-holdback-delete" data-hold-index="${rowIndex}">×</button>
      ${menuOpen ? `
        <div class="row-action-menu">
          <button class="row-action-menu-item" data-action="insert-holdback-section" data-hold-index="${effectiveIndex}">+ Раздел</button>
          <button class="row-action-menu-item" data-action="insert-holdback-subitem" data-hold-index="${effectiveIndex}">+ Подпункт</button>
        </div>
      ` : ''}
      ${confirmDelete ? `
        <div class="row-action-confirm">
          <div class="row-action-confirm-label">${rowKind === 'subitem' ? 'Удалить подпункт?' : 'Удалить раздел со вложениями?'}</div>
          <div class="row-action-confirm-buttons">
            <button class="row-action-confirm-btn confirm" data-action="confirm-holdback-delete" data-hold-index="${rowIndex}">✓</button>
            <button class="row-action-confirm-btn cancel" data-action="cancel-holdback-delete" data-hold-index="${rowIndex}">×</button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}


function renderSettlementPresetButtons(presets) {
  return presets.map((presetKey) => {
    const preset = SETTLEMENT_ROW_PRESETS[presetKey];
    return `<button class="row-action-menu-item" data-action="add-settlement-row" data-preset="${presetKey}">+ ${escapeHtml(preset.label)}</button>`;
  }).join('');
}

function renderSettlementAddMenu() {
  const menuOpen = Boolean(app.state.ui.settlementAddMenu);
  return `
    <div class="settlement-add-anchor">
      <button class="mini" data-action="toggle-settlement-add-menu">+ ВидТреб / ВидУдерж</button>
      ${menuOpen ? `
        <div class="row-action-menu row-action-menu-wide settlement-add-menu">
          <div class="settlement-menu-group">
            <div class="settlement-menu-title">ВидУдерж</div>
            ${renderSettlementPresetButtons(['withholdAdvance', 'withholdGuarantee', 'withholdPenalty', 'withholdErrorCorrection', 'withholdOtherObjects', 'withholdOther'])}
          </div>
          <div class="settlement-menu-group">
            <div class="settlement-menu-title">ВидТреб</div>
            ${renderSettlementPresetButtons(['claimPenalty', 'claimGuarantee', 'claimErrorCorrection', 'claimOtherObjects', 'claimOther'])}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderSettlementRowActions(rowIndex, row) {
  const confirmOpen = app.state.ui.settlementDeleteConfirm === rowIndex;
  return `
    <div class="settlement-inline-actions">
      <button class="mini ${row.isPrimary ? '' : 'secondary'} settlement-primary-btn" data-action="set-primary-settlement-row" data-settlement-index="${rowIndex}">${row.isPrimary ? 'Основная XSD-ready' : 'Сделать основной'}</button>
      ${confirmOpen ? `
        <div class="settlement-inline-confirm">
          <span>Удалить строку?</span>
          <button class="mini danger" data-action="confirm-settlement-delete" data-settlement-index="${rowIndex}">Да</button>
          <button class="mini secondary" data-action="cancel-settlement-delete" data-settlement-index="${rowIndex}">Нет</button>
        </div>
      ` : `<button class="mini danger" data-action="request-settlement-delete" data-settlement-index="${rowIndex}">Удалить</button>`}
    </div>
  `;
}

function renderInlineSettlementRows(settlement) {
  const manualRows = settlement.manualRows || [];
  const autoRows = settlement.autoRows || [];
  const representativeRow = settlement.representativeRow || null;
  const autoRowsSummary = autoRows.length
    ? autoRows.map((row) => `<span class="settlement-chip">${escapeHtml(settlementCodeLabel(row.kind, row.kindCode))}: <strong>${formatMoney(numberOrZero(row.amount))}</strong></span>`).join('')
    : '<span class="settlement-chip settlement-chip-muted">Автострок из таблицы удержаний пока нет.</span>';

  const previewRow = `
    <tr class="holdback-xml-preview-row">
      <td colspan="13">
        <div class="settlement-preview ${representativeRow ? '' : 'muted'}">
          <strong>XSD-ready сейчас возьмет:</strong>
          <span>${escapeHtml(buildRepresentativeSettlementLabel(representativeRow))}</span>
        </div>
        <div class="settlement-chip-list">${autoRowsSummary}</div>
      </td>
    </tr>
  `;

  const manualRowsHtml = manualRows.map((row, index) => {
    const otherCode = isSettlementOtherCode(row);
    return `
      <tr class="holdback-xml-row ${row.isPrimary ? 'is-primary' : ''}">
        <td colspan="13">
          <div class="holdback-xml-card">
            <div class="holdback-xml-card-head">
              <div>
                <div class="holdback-xml-title">${escapeHtml(row.comment || `Ручная строка СвОРасч #${index + 1}`)}</div>
                <div class="holdback-xml-subtitle">Встроенная XML-строка внутри общей таблицы удержаний</div>
              </div>
              ${renderSettlementRowActions(index, row)}
            </div>
            <div class="form-grid holdback-xml-grid">
              ${renderSelect('Ветка XML', `xmlExtras.settlementRows.${index}.kind`, row.kind, { withhold: 'ВидУдерж', claim: 'ВидТреб' }, 'quarter')}
              ${renderSelect('Код вида', `xmlExtras.settlementRows.${index}.kindCode`, row.kindCode, settlementCodeOptions(row.kind), 'half')}
              ${renderInput('Сумма, руб.', `xmlExtras.settlementRows.${index}.amount`, row.amount, 'number', 'quarter')}
              ${renderInput('Документ-основание', `xmlExtras.settlementRows.${index}.documentRef`, row.documentRef, 'string', 'half')}
              ${otherCode
                ? renderInput('Иной вид', `xmlExtras.settlementRows.${index}.customKindText`, row.customKindText, 'string', 'half')
                : renderReadonly('Иной вид', '—', 'half')}
              ${renderTextarea('Комментарий / пометка', `xmlExtras.settlementRows.${index}.comment`, row.comment, 'half')}
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  const emptyRow = manualRows.length ? '' : `
    <tr class="holdback-xml-empty-row">
      <td colspan="13">
        <div class="settlement-empty">Если нужен ручной <strong>ВидТреб</strong> или <strong>ВидУдерж</strong>, добавь его прямо сюда через кнопку <strong>+ ВидТреб / ВидУдерж</strong>.</div>
      </td>
    </tr>
  `;

  return previewRow + emptyRow + manualRowsHtml;
}

function renderKs3RowActions(rowIndex) {
  const menuOpen = app.state.ui.ks3RowActionMenu === rowIndex;
  const confirmOpen = app.state.ui.ks3RowDeleteConfirm === rowIndex;
  return `
    <div class="row-action-stack">
      <button class="stack-button add" title="Добавить строку ниже" aria-label="Добавить строку ниже" data-action="toggle-ks3-row-menu" data-ks3-index="${rowIndex}">+</button>
      <button class="stack-button remove" title="Удалить строку" aria-label="Удалить строку" data-action="prompt-delete-ks3-row" data-ks3-index="${rowIndex}">×</button>
      ${menuOpen ? `
        <div class="row-action-menu">
          <button class="row-action-menu-item" data-action="insert-ks3-row-after" data-ks3-index="${rowIndex}">+ Строка</button>
        </div>
      ` : ''}
      ${confirmOpen ? `
        <div class="row-action-confirm">
          <div class="row-action-confirm-title">Удалить?</div>
          <div class="row-action-confirm-buttons">
            <button class="confirm-icon confirm-yes" title="Подтвердить" aria-label="Подтвердить" data-action="confirm-delete-ks3-row" data-ks3-index="${rowIndex}">✓</button>
            <button class="confirm-icon confirm-no" title="Отмена" aria-label="Отмена" data-action="cancel-delete-ks3-row" data-ks3-index="${rowIndex}">×</button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderKs3Pane() {
  const ks3 = app.state.ks3;
  const rows = buildKs3Rows();
  const totals = buildKs3Totals(rows);
  const vat = totals.vat;

  return `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">КС-3 — сводная справка</h2>
          <p class="panel-subtitle">Лист КС-3 заполняется вручную. Данные из листов КС-2 сюда автоматически не подтягиваются.</p>
        </div>
        <button class="mini" data-action="add-ks3-row">+ Строка КС-3</button>
      </div>

      ${app.state.common.showDocumentHeaders ? renderExcelDocFrame({
        formTitle: '№ КС-3 · Справка о стоимости выполненных работ и затрат',
        docLabel: app.state.common.ks3DocLabel,
        docSubtitle: app.state.common.ks3DocSubtitle,
        formCode: app.state.common.okudKs3,
        common: app.state.common,
        contractLabel: 'Договор подряда (контракт)',
        documentNumber: ks3.documentNumber,
        documentDate: ks3.documentDate,
        periodFrom: ks3.periodFrom,
        periodTo: ks3.periodTo,
        objectLabel: 'Объект',
      }) : ''}

      <div class="form-grid">
        ${renderInput('Номер справки', 'ks3.documentNumber', ks3.documentNumber, 'string', 'quarter')}
        ${renderInput('Дата составления', 'ks3.documentDate', ks3.documentDate, 'string', 'quarter')}
        ${renderInput('Период с', 'ks3.periodFrom', ks3.periodFrom, 'string', 'quarter')}
        ${renderInput('Период по', 'ks3.periodTo', ks3.periodTo, 'string', 'quarter')}
      </div>

      <div class="section-block">
        <h3>Ручные строки КС-3</h3>
        <p class="kbd-note">Можно добавлять строки, которых нет среди листов КС-2. КС-3 больше не строится как автосвод по актам.</p>
        <div class="table-wrapper">
          <table class="table table-ks3-like" data-table-id="ks3">
            <colgroup>
              <col class="ks3-col-order" />
              <col class="ks3-col-name" />
              <col class="ks3-col-code" />
              <col class="ks3-col-start" />
              <col class="ks3-col-year" />
              <col class="ks3-col-period" />
              <col class="ks3-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th data-table-id="ks3" data-col-selector="ks3-col-order" data-min-width="46">№ п/п<span class="resize-handle"></span></th>
                <th data-table-id="ks3" data-col-selector="ks3-col-name" data-min-width="260">Наименование пусковых комплексов, этапов, объектов, видов выполненных работ, оборудования, затрат<span class="resize-handle"></span></th>
                <th data-table-id="ks3" data-col-selector="ks3-col-code" data-min-width="64">Код<span class="resize-handle"></span></th>
                <th data-table-id="ks3" data-col-selector="ks3-col-start" data-min-width="120">С начала проведения работ<span class="resize-handle"></span></th>
                <th data-table-id="ks3" data-col-selector="ks3-col-year" data-min-width="110">С начала года<span class="resize-handle"></span></th>
                <th data-table-id="ks3" data-col-selector="ks3-col-period" data-min-width="120">В том числе за отчетный период<span class="resize-handle"></span></th>
                <th data-table-id="ks3" data-col-selector="ks3-col-actions" data-min-width="24"><span class="resize-handle"></span></th>
              </tr>
              <tr class="numbering-row">
                <th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th></th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row, index) => {
                const rowClass = /всего работ и затрат/i.test(row.name || '')
                  ? 'ks3-row-total'
                  : /^в том числе/i.test(row.name || '')
                    ? 'ks3-row-subhead'
                    : '';
                return `
                  <tr class="${rowClass}">
                    <td>${renderTableInput(`ks3.rows.${index}.order`, row.order)}</td>
                    <td class="ks3-name-cell">${renderTableTextarea(`ks3.rows.${index}.name`, row.name)}</td>
                    <td>${renderTableInput(`ks3.rows.${index}.code`, row.code)}</td>
                    <td class="number-cell">${renderTableInput(`ks3.rows.${index}.fromStart`, formatEditableNumber(row.fromStart), 'number')}</td>
                    <td class="number-cell">${renderTableInput(`ks3.rows.${index}.fromYearStart`, formatEditableNumber(row.fromYearStart), 'number')}</td>
                    <td class="number-cell">${renderTableInput(`ks3.rows.${index}.forPeriod`, formatEditableNumber(row.forPeriod), 'number')}</td>
                    <td class="actions-cell">${renderKs3RowActions(index)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="inline-actions">
          <button class="mini" data-action="add-ks3-row">+ Строка КС-3</button>
        </div>
      </div>

      <div class="section-block">
        <h3>Ручные итоги КС-3</h3>
        <div class="form-grid">
          ${renderInput('Итого с начала работ', 'ks3.totals.fromStart', totals.fromStart, 'number', 'quarter')}
          ${renderInput('Итого с начала года', 'ks3.totals.fromYearStart', totals.fromYearStart, 'number', 'quarter')}
          ${renderInput('Итого за период', 'ks3.totals.forPeriod', totals.forPeriod, 'number', 'quarter')}
          ${renderInput('Сумма НДС', 'ks3.totals.vat', totals.vat, 'number', 'quarter')}
        </div>
      </div>

      <div class="summary-grid">
        <div class="summary-card"><span>Итого с начала работ</span><strong>${formatMoney(totals.fromStart)}</strong></div>
        <div class="summary-card"><span>Итого с начала года</span><strong>${formatMoney(totals.fromYearStart)}</strong></div>
        <div class="summary-card"><span>Итого за период</span><strong>${formatMoney(totals.forPeriod)}</strong></div>
        <div class="summary-card"><span>Сумма НДС</span><strong>${formatMoney(vat)}</strong></div>
      </div>

      ${renderKs3TotalsBlock(totals, vat)}
      ${app.state.common.showDocumentSignatures ? renderKs3SignatureTable(app.state.common) : ''}
    </div>
  `;
}

function renderHoldbacksPane(sheetIndex = null) {
  const targetSheetId = sheetIndex == null ? null : app.state.ks2Sheets[sheetIndex]?.id;
  const groups = buildHoldbackGroups(targetSheetId);
  const rows = groups.map((group) => renderHoldbackGroup(group)).join('');

  const totals = groups.reduce((acc, group) => {
    const sectionRow = group.section.row;
    const computed = computeHoldbackSectionComputed(group);
    acc.ks2Amount += numberOrZero(sectionRow.ks2Amount);
    acc.materialsUsed += numberOrZero(sectionRow.materialsUsed);
    acc.advanceReceived += computed.advanceReceived;
    acc.previousBalance += computed.previousBalance;
    acc.closingAmount += computed.closingAmount;
    acc.nextBalance += computed.nextBalance;
    acc.retentionAmount += computed.retentionAmount;
    acc.payableAmount += computed.payableAmount;
    return acc;
  }, { ks2Amount: 0, materialsUsed: 0, advanceReceived: 0, previousBalance: 0, closingAmount: 0, nextBalance: 0, retentionAmount: 0, payableAmount: 0 });

  return `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">Удержания и авансы</h2>
          <p class="panel-subtitle">Гарантийное удержание по этому листу КС-2 идет первой строкой, ниже — все записи по авансам и их закрытию из Excel.</p>
        </div>
        <div class="panel-header-actions">
          <button class="mini" data-action="add-holdback-row" ${sheetIndex == null ? '' : `data-sheet-index="${sheetIndex}"`}>+ Раздел удержаний</button>
        </div>
      </div>

      ${app.state.common.showDocumentHeaders ? `
        <div class="excel-frame excel-frame-tight">
          <div class="excel-frame-title">Расчет суммы погашения авансов и гарантийного удержания</div>
          <div class="excel-frame-subtitle">за период ${escapeHtml(sheetIndex == null ? '' : (app.state.ks2Sheets[sheetIndex]?.periodTo || ''))}</div>
          <div class="excel-basis-row">
            <span class="excel-basis-label">Объект:</span>
            <div class="excel-basis-value">${escapeHtml(app.state.common.objectName || app.state.common.constructionObject || '')}</div>
          </div>
        </div>
      ` : ''}

      <div class="table-wrapper">
        <table class="table table-holdbacks" data-table-id="holdbacks">
          <colgroup>
            <col class="hold-col-name" />
            <col class="hold-col-ks2" />
            <col class="hold-col-materials" />
            <col class="hold-col-advance" />
            <col class="hold-col-doc" />
            <col class="hold-col-previous" />
            <col class="hold-col-closing" />
            <col class="hold-col-next" />
            <col class="hold-col-percent" />
            <col class="hold-col-retention" />
            <col class="hold-col-payable" />
            <col class="hold-col-comment" />
            <col class="hold-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th data-table-id="holdbacks" data-col-selector="hold-col-name" data-min-width="220">Всего работ и затрат / наименование<span class="resize-handle"></span></th>
              <th data-table-id="holdbacks" data-col-selector="hold-col-ks2" data-min-width="84">Сумма работ по акту КС-2, руб.<span class="resize-handle"></span></th>
              <th data-table-id="holdbacks" data-col-selector="hold-col-materials" data-min-width="84">Использовано материалов, руб.<span class="resize-handle"></span></th>
              <th data-table-id="holdbacks" data-col-selector="hold-col-advance" data-min-width="84">Полученный аванс, руб.<span class="resize-handle"></span></th>
              <th data-table-id="holdbacks" data-col-selector="hold-col-doc" data-min-width="120">№ п/п, дата<span class="resize-handle"></span></th>
              <th data-table-id="holdbacks" data-col-selector="hold-col-previous" data-min-width="84">Незакрытый остаток прошлого периода, руб.<span class="resize-handle"></span></th>
              <th data-table-id="holdbacks" data-col-selector="hold-col-closing" data-min-width="84">Сумма закрытия, руб.<span class="resize-handle"></span></th>
              <th data-table-id="holdbacks" data-col-selector="hold-col-next" data-min-width="84">Остаток к закрытию следующего периода, руб.<span class="resize-handle"></span></th>
              <th data-table-id="holdbacks" data-col-selector="hold-col-percent" data-min-width="40">Удерж., %<span class="resize-handle"></span></th>
              <th data-table-id="holdbacks" data-col-selector="hold-col-retention" data-min-width="84">Удержание, руб.<span class="resize-handle"></span></th>
              <th data-table-id="holdbacks" data-col-selector="hold-col-payable" data-min-width="84">Итого к оплате, руб.<span class="resize-handle"></span></th>
              <th data-table-id="holdbacks" data-col-selector="hold-col-comment" data-min-width="100">Комментарий<span class="resize-handle"></span></th>
              <th data-table-id="holdbacks" data-col-selector="hold-col-actions" data-min-width="40"><span class="resize-handle"></span></th>
            </tr>
            <tr class="numbering-row">
              <th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th><th>8</th><th>9</th><th>10</th><th>11</th><th>12</th><th></th>
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

      ${renderHoldbacksTotalsBlock(totals)}
      ${app.state.common.showDocumentSignatures ? renderKs3SignatureTable(app.state.common) : ''}
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
          ${renderReadonly('Идентификатор файла', generated.fileId, 'half', 'xml.generated.fileId')}
          ${renderReadonly('Дата формирования', generated.fileDate, 'quarter', 'xml.generated.fileDate')}
          ${renderReadonly('Время формирования', generated.fileTime, 'quarter', 'xml.generated.fileTime')}
          ${renderReadonly('КНД', generated.knd, 'quarter', 'xml.generated.knd')}
          ${renderReadonly('Версия формата', generated.formatVersion, 'quarter', 'xml.generated.formatVersion')}
          ${renderReadonly('Версия программы', generated.programVersion, 'quarter', 'xml.generated.programVersion')}
        </div>
      </div>

      <div class="section-block">
        <h3>Постоянные настройки документа</h3>
        <div class="form-grid">
          ${renderSelect('Строительство для гос/мун нужд', 'xmlExtras.constants.isGovMunicipal', constants.isGovMunicipal, { '0': '0 — нет', '1': '1 — да' }, 'quarter')}
          ${renderSelect('Режим НДС', 'xmlExtras.constants.vatCalcInTotalOnly', constants.vatCalcInTotalOnly, { '0': '0 — НДС по строкам/разделам (основной)', '1': '1 — НДС только в итоге' }, 'half')}
          ${renderSelect('Признак накопительного итога', 'xmlExtras.constants.cumulativeMode', constants.cumulativeMode, { '0': '0 — без накопления', '1': '1 — в акте всё', '2': '2 — только строка «Всего»' }, 'half')}
          ${renderInput('Год индекса цен', 'xmlExtras.constants.priceIndexYear', constants.priceIndexYear, 'string', 'quarter')}
          ${renderSelect('Сведения о расчётах для согласования', 'xmlExtras.constants.requiresSettlementApproval', constants.requiresSettlementApproval, { '0': '0 — нет', '1': '1 — да' }, 'quarter')}
          ${renderSelect('Режим табличной части XML', 'xmlExtras.constants.diadocCompactMode', constants.diadocCompactMode || '0', { '1': 'compact / pass-friendly', '0': 'full / как в форме' }, 'half')}
        </div>
      </div>

      <div class="section-block">
        <h3>Подрядчик / общий XML (P)</h3>
        <div class="form-grid">
          ${renderInput('Наименование экономического субъекта-составителя', 'xmlExtras.manual.economicSubjectName', manual.economicSubjectName, 'string', 'half')}
          ${renderSelect('Тип акта', 'xmlExtras.manual.isCorrectionAct', manual.isCorrectionAct || '0', { '0': '0 — первичный акт', '1': '1 — исправленный акт' }, 'half')}
          ${String(manual.isCorrectionAct || '0') === '1' ? renderInput('Исправление №', 'xmlExtras.manual.correctionNumber', manual.correctionNumber, 'string', 'quarter') : ''}
          ${String(manual.isCorrectionAct || '0') === '1' ? renderInput('Дата исправления', 'xmlExtras.manual.correctionDate', manual.correctionDate, 'string', 'quarter') : ''}
          ${renderSelect('Изменение сметы', 'xmlExtras.manual.hasEstimateChange', manual.hasEstimateChange || '1', { '0': '0 — смета не менялась', '1': '1 — смета менялась' }, 'half')}
          ${String(manual.hasEstimateChange || '1') === '1' ? renderInput('Версия сметы (КодСмет)', 'xmlExtras.manual.estimateVersionCode', manual.estimateVersionCode, 'string', 'quarter') : ''}
          ${String(manual.hasEstimateChange || '1') === '1' ? renderInput('Тип допсоглашения', 'xmlExtras.manual.supplementDocType', manual.supplementDocType, 'string', 'quarter') : ''}
          ${String(manual.hasEstimateChange || '1') === '1' ? renderInput('Номер допсоглашения', 'xmlExtras.manual.supplementDocNumber', manual.supplementDocNumber, 'string', 'quarter') : ''}
          ${String(manual.hasEstimateChange || '1') === '1' ? renderInput('Дата допсоглашения', 'xmlExtras.manual.supplementDocDate', manual.supplementDocDate, 'string', 'quarter') : ''}
          ${renderInput('ИНН подрядчика', 'xmlExtras.manual.contractorInn', manual.contractorInn, 'string', 'quarter')}
          ${renderInput('ИНН заказчика', 'xmlExtras.manual.customerInn', manual.customerInn, 'string', 'quarter')}
          ${renderInput('Индекс застройщика / адреса работ', 'xmlExtras.manual.developerPostalIndex', manual.developerPostalIndex, 'string', 'quarter')}
          ${renderInput('Код региона застройщика / адреса работ', 'xmlExtras.manual.developerRegionCode', manual.developerRegionCode, 'string', 'quarter')}
          ${renderInput('Подписант XML — ФИО', 'xmlExtras.manual.signerName', manual.signerName || app.state.common.contractorSignerName, 'string', 'quarter')}
          ${renderInput('Подписант XML — должность', 'xmlExtras.manual.signerPosition', manual.signerPosition || app.state.common.contractorSignerPosition, 'string', 'half')}
          ${renderSelect('Подписант XML — статус', 'xmlExtras.manual.signerStatus', manual.signerStatus || '1', { '1': '1 — без доверенности', '2': '2 — доверенность в ЭФ', '3': '3 — доверенность на бумаге' }, 'quarter')}
          ${renderSelect('Подписант XML — тип подписи', 'xmlExtras.manual.signatureType', manual.signatureType || '1', { '1': '1 — УКЭП', '2': '2 — ПЭП', '3': '3 — УНЭП' }, 'quarter')}
          ${renderInput('ИнфПолФХЖ1 / customField', 'xmlExtras.manual.customInfoValue', manual.customInfoValue || 'sample', 'string', 'quarter')}
          ${renderInput('Индекс подрядчика', 'xmlExtras.manual.contractorPostalIndex', manual.contractorPostalIndex, 'string', 'quarter')}
          ${renderInput('Код региона подрядчика', 'xmlExtras.manual.contractorRegionCode', manual.contractorRegionCode, 'string', 'quarter')}
        </div>
      </div>

      <div class="section-block">
        <h3>Заказчик / файл Z</h3>
        <p class="kbd-note">Здесь только дополнительные поля схемы заказчика. Если оставить пустыми, генератор возьмёт данные из общих реквизитов, КС-3 и подписантов формы.</p>
        <div class="form-grid">
          ${renderInput('Составитель файла Z', 'xmlExtras.manual.customerEconomicSubjectName', manual.customerEconomicSubjectName || app.state.common.techCustomerName || app.state.common.developerName, 'string', 'half')}
          ${renderInput('Основание подписания заказчика', 'xmlExtras.manual.customerAuthorityDocName', manual.customerAuthorityDocName || 'Доверенность / основание подписания заказчика', 'string', 'half')}
          ${renderInput('Номер основания заказчика', 'xmlExtras.manual.customerAuthorityDocNumber', manual.customerAuthorityDocNumber || app.state.common.contractNumber, 'string', 'quarter')}
          ${renderInput('Дата основания заказчика', 'xmlExtras.manual.customerAuthorityDocDate', manual.customerAuthorityDocDate || app.state.common.contractDate, 'string', 'quarter')}
          ${renderSelect('Статус подписанта Z', 'xmlExtras.manual.customerSignerStatus', manual.customerSignerStatus || manual.signerStatus || '1', { '1': '1 — без доверенности', '2': '2 — доверенность в ЭФ', '3': '3 — доверенность на бумаге' }, 'quarter')}
          ${renderSelect('Тип подписи Z', 'xmlExtras.manual.customerSignatureType', manual.customerSignatureType || manual.signatureType || '1', { '1': '1 — УКЭП', '2': '2 — ПЭП', '3': '3 — УНЭП' }, 'quarter')}
          ${renderInput('Идентификатор хранения подписи Z', 'xmlExtras.manual.customerSignatureStorageId', manual.customerSignatureStorageId, 'string', 'half')}
          ${renderSelect('Приемка работ в Z', 'xmlExtras.manual.customerAcceptanceCode', manual.customerAcceptanceCode || '1', { '1': '1 — приняты без замечаний', '2': '2 — приняты с устранимыми недостатками', '4': '4 — приняты с уменьшением стоимости', '5': '5 — приняты с возмещением расходов', '0': '0 — отказ в приемке' }, 'half')}
          ${renderTextarea('Текст приемки Z (если нужен вместо кода)', 'xmlExtras.manual.customerAcceptanceText', manual.customerAcceptanceText, 'half')}
          ${renderSelect('Извещение по расчетам Z', 'xmlExtras.manual.customerSettlementNotice', manual.customerSettlementNotice || '', { '': '— не заполнять —', 'С представленными подрядчиком сведениями о расчетах согласен': 'С представленными подрядчиком сведениями о расчетах согласен', 'С представленными подрядчиком сведениями о расчетах согласен, есть информация о дополнительных удержаниях заказчиком в соответствии с законодательством о контрактной системе в сфере закупок товаров, работ, услуг для обеспечения государственных и муниципальных нужд': 'Согласен, есть доп. удержания по гос/мун контракту', 'С представленными подрядчиком сведениями о расчетах не согласен': 'С представленными подрядчиком сведениями о расчетах не согласен', 'Представленные подрядчиком сведения о расчетах по договору на момент приемки работ не сверялись': 'Сведения по расчетам на момент приемки не сверялись', 'Условиями договора строительного подряда сверка расчетов по договору непосредственно в акте о приемке выполненных работ не предусмотрена': 'Сверка расчетов в акте не предусмотрена' }, 'half')}
          ${renderTextarea('Причина несогласия по расчетам Z', 'xmlExtras.manual.customerSettlementDisagreementReason', manual.customerSettlementDisagreementReason, 'half')}
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
                  <td>${renderTableInput(`xmlExtras.traceableGoods.${index}.registrationNumber`, row.registrationNumber)}</td>
                  <td>${renderTableInput(`xmlExtras.traceableGoods.${index}.unitCode`, row.unitCode)}</td>
                  <td>${renderTableInput(`xmlExtras.traceableGoods.${index}.unitName`, row.unitName)}</td>
                  <td>${renderTableInput(`xmlExtras.traceableGoods.${index}.quantity`, formatEditableNumber(row.quantity), 'number')}</td>
                  <td><button class="icon-button danger" title="Удалить строку" aria-label="Удалить строку" data-action="delete-trace-row" data-trace-index="${index}">×</button></td>
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

function normalizeKs3Row(row = {}) {
  return {
    order: row.order ?? '',
    name: row.name || '',
    code: row.code ?? '',
    fromStart: numberOrNull(row.fromStart),
    fromYearStart: numberOrNull(row.fromYearStart),
    forPeriod: numberOrNull(row.forPeriod),
    vat: numberOrNull(row.vat),
  };
}

function createBlankKs3Row() {
  return {
    order: '',
    name: '',
    code: '',
    fromStart: null,
    fromYearStart: null,
    forPeriod: null,
    vat: null,
  };
}

function buildKs3Rows() {
  return (app.state.ks3?.rows || [])
    .map((row) => normalizeKs3Row(row))
    .filter((row) => row.order || row.name || row.code || row.fromStart != null || row.fromYearStart != null || row.forPeriod != null || row.vat != null);
}

function buildKs3Totals(rows = buildKs3Rows()) {
  const explicit = app.state.ks3?.totals || {};
  const hasExplicit = ['fromStart', 'fromYearStart', 'forPeriod', 'vat'].some((key) => explicit[key] != null && explicit[key] !== '');
  if (hasExplicit) {
    return {
      fromStart: numberOrZero(explicit.fromStart),
      fromYearStart: numberOrZero(explicit.fromYearStart),
      forPeriod: numberOrZero(explicit.forPeriod),
      vat: numberOrZero(explicit.vat),
    };
  }

  const totalRow = rows.find((row) => /всего работ и затрат/i.test(row.name || ''));
  if (totalRow) {
    return {
      fromStart: numberOrZero(totalRow.fromStart),
      fromYearStart: numberOrZero(totalRow.fromYearStart),
      forPeriod: numberOrZero(totalRow.forPeriod),
      vat: numberOrZero(explicit.vat),
    };
  }

  return {
    fromStart: 0,
    fromYearStart: 0,
    forPeriod: 0,
    vat: numberOrZero(explicit.vat),
  };
}

function buildGeneratedXmlFields() {
  const generated = app.state.xmlExtras.generated;
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8);
  const documentNumber = app.state.ks2Sheets[0]?.documentNumber || '1';
  const contractorInn = app.state.xmlExtras.manual.contractorInn || '0000000000000';
  return {
    fileDate: generated.fileDate || date,
    fileTime: generated.fileTime || time,
    knd: generated.knd || '1110335',
    formatVersion: generated.formatVersion || '1.00',
    programVersion: generated.programVersion || 'KC2-KC3-XML-webapp',
    fileId: `ON_AKTREZRABP_0000000000000_${contractorInn}_${date.replaceAll('-', '')}_${String(documentNumber).padStart(3, '0')}`,
  };
}

function formatXmlDate(value) {
  if (!value) return '01.01.2026';
  const str = String(value).trim().replace(' г.', '').replace(' г', '');
  if (str.length === 10 && str[4] === '-' && str[7] === '-') {
    const [yyyy, mm, dd] = str.split('-');
    return `${dd}.${mm}.${yyyy}`;
  }
  return str.slice(0, 10);
}

function xmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function splitSignerName(text) {
  const parts = String(text || '').replaceAll(',', ' ').split(/\s+/).filter(Boolean);
  if (!parts.length) return { family: 'Иванов', name: 'Иван', patronymic: '' };
  if (parts.length === 1) return { family: parts[0], name: 'Иван', patronymic: '' };
  if (parts.length === 2) return { family: parts[0], name: parts[1], patronymic: '' };
  return { family: parts[0], name: parts[1], patronymic: parts.slice(2).join(' ') };
}

function buildXmlExportString(model) {
  const common = model.common;
  const manual = model.xml.manual;
  const generated = model.xml.generated;
  const constants = model.xml.constants;
  const traceableGoods = model.xml.traceableGoods || [];
  const settlement = model.xml.settlement || { totalRetention: 0, totalClaims: 0, settlementRows: [] };
  const firstSheet = model.ks2Sheets[0] || { document: {}, items: [] };
  const signer = splitSignerName(manual.signerName || common.contractorSignerName || common.contractorSigner || common.contractorResponsible || 'Иванов Иван');
  const signerAttr = signer.patronymic ? ` Отчество="${xmlEscape(signer.patronymic)}"` : '';
  let globalRowNo = 1;
  const worksXml = model.ks2Sheets.flatMap((sheet, sheetIndex) => (
    (sheet.items || []).map((item, itemIndex) => {
      const amount = numberOrZero(item.amount);
      const vat = Math.max(round2(amount * 0.2), 0);
      const traceXml = globalRowNo === 1 && traceableGoods.length ? `\n        <СвПрослежСтройка НомТовПрослеж="${xmlEscape(traceableGoods[0].registrationNumber || '123456789012345678901234567')}" ЕдИзмПрослеж="${xmlEscape(traceableGoods[0].unitCode || '796')}" НаимЕдИзмПрослеж="${xmlEscape(traceableGoods[0].unitName || 'шт')}" КолВЕдПрослеж="${xmlEscape(String(numberOrZero(traceableGoods[0].quantity) || 1))}"/>` : '';
      const xml = `      <ВидРаб НаимТов="${xmlEscape(item.name || `Работа ${sheetIndex + 1}.${itemIndex + 1}`)}" ЦенаТов="${formatMoney(numberOrZero(item.price))}" СтТовБезНДС="${formatMoney(amount)}" НомСтр="${globalRowNo}" НомПоз="${xmlEscape(item.lineNo || String(globalRowNo))}" ТипЗатр="${xmlEscape(normalizeExpenseType(item.expenseType, item))}" ОКЕИ_Стройка="796" НаимЕдИзм="${xmlEscape(item.unit || 'шт')}">\n        <УчОшИНовОбстСт>\n          <ОшибПрПер>\n            <УвелДен>1</УвелДен>\n            <УвелКол>1</УвелКол>\n          </ОшибПрПер>\n        </УчОшИНовОбстСт>\n        <СумНал>\n          <СумНал>${formatMoney(vat)}</СумНал>\n        </СумНал>${traceXml}\n      </ВидРаб>`;
      globalRowNo += 1;
      return xml;
    })
  )).join('\n');
  const sectionsXml = (model.holdbacks.sections || []).map((section, idx) => `      <Раздел НаимРаздел="${xmlEscape(section.name || `Раздел №${idx + 1}`)}" СтБезНДСРаздОтч="${formatMoney(numberOrZero(section.ks2Amount))}">\n${(section.subitems || []).map((sub, subIdx) => `        <СвВидРаб НаимТов="${xmlEscape(sub.advanceDoc || `Подпункт ${idx + 1}.${subIdx + 1}`)}" ЦенаТов="${formatMoney(numberOrZero(sub.advanceReceived))}" СтТовБезНДС="${formatMoney(numberOrZero(sub.closingAmount))}"/>`).join('\n') || `        <СвВидРаб НаимТов="${xmlEscape(section.name || `Раздел №${idx + 1}`)}" ЦенаТов="${formatMoney(numberOrZero(section.ks2Amount))}" СтТовБезНДС="${formatMoney(numberOrZero(section.ks2Amount))}"/>`}\n      </Раздел>`).join('\n');
  const settlementRowsXml = (settlement.settlementRows?.length ? settlement.settlementRows : [{ amount: 1, kindCode: '31' }]).map((row) => `      <УчетТребУдерж СумТребУдерж="${formatMoney(Math.max(numberOrZero(row.amount), 1))}">\n        <ВидУдерж>${xmlEscape(row.kindCode || '31')}</ВидУдерж>\n      </УчетТребУдерж>`).join('\n');

  return `<?xml version="1.0" encoding="windows-1251"?>
<Файл ИдФайл="${xmlEscape(generated.fileId)}" ВерсПрог="${xmlEscape(generated.programVersion)}" ВерсФорм="${xmlEscape(generated.formatVersion)}">
  <Документ КНД="${xmlEscape(generated.knd)}" ДатаИнфПодр="${xmlEscape(formatXmlDate(generated.fileDate))}" ВремИнфПодр="${xmlEscape(generated.fileTime)}" НаимЭкСубСост="${xmlEscape(manual.economicSubjectName || common.contractorName || 'Организация')}">
    <ОснДовОргСост>
      <ИдРекСост>
        <ИННЮЛ>${xmlEscape(manual.contractorInn || '7701234567')}</ИННЮЛ>
      </ИдРекСост>
    </ОснДовОргСост>
    <СвАктСдПр НомерДок="${xmlEscape(firstSheet.document.number || 'без номера')}" ДатаДок="${xmlEscape(formatXmlDate(firstSheet.document.date))}" НаимОб="${xmlEscape(common.objectName || common.constructionObject || 'Объект строительства')}" КодОКВДог="643">
      <ИдДог>
        <ТипИдДок НаимДок="Договор генподряда" НомерДок="${xmlEscape(common.contractNumber || 'без номера')}" ДатаДок="${xmlEscape(formatXmlDate(common.contractDate))}"/>
      </ИдДог>
      <ИспрАктСдПр НомИспр="${xmlEscape(manual.correctionNumber || '1')}" ДатаИспр="${xmlEscape(formatXmlDate(manual.correctionDate || firstSheet.document.date))}"/>
      <СвПодр>
        <СвСторДог>
          <ИдСв>
            <СвЮЛУч НаимОрг="${xmlEscape(common.contractorName || 'Подрядчик')}" ИННЮЛ="${xmlEscape(manual.contractorInn || '7701234567')}"/>
          </ИдСв>
        </СвСторДог>
      </СвПодр>
      <СвЗак>
        <СвСторДог>
          <ИдСв>
            <СвЮЛУч НаимОрг="${xmlEscape(common.developerName || common.techCustomerName || 'Заказчик')}" ИННЮЛ="${xmlEscape(manual.customerInn || '7701234567')}"/>
          </ИдСв>
        </СвСторДог>
      </СвЗак>
      <ОсновСтроит ПрГосМун="${xmlEscape(constants.isGovMunicipal || '0')}"/>
      <МестВыпРаб>
        <АдрРФ Индекс="${xmlEscape(manual.developerPostalIndex || '123456')}" КодРегион="${xmlEscape(manual.developerRegionCode || '77')}"/>
      </МестВыпРаб>
      <ИзмСмет КодСмет="${xmlEscape(manual.estimateVersionCode || '1')}">
        <ИдДопСогл>
          <ТипИдДок НаимДок="${xmlEscape(manual.supplementDocType || 'Дополнительное соглашение')}" НомерДок="${xmlEscape(manual.supplementDocNumber || 'ДС-1')}" ДатаДок="${xmlEscape(formatXmlDate(manual.supplementDocDate || firstSheet.document.date))}"/>
        </ИдДопСогл>
      </ИзмСмет>
      <ДенИзм КодОКВ="643"/>
      <ИнфПолФХЖ1>
        <ТекстИнф Идентиф="customField" Значение="generated"/>
      </ИнфПолФХЖ1>
    </СвАктСдПр>
    <НаимИСт>
${worksXml}${worksXml && sectionsXml ? '\n' : ''}${sectionsXml}
    </НаимИСт>
    <СвПродПер>
      <СвПер СодОпер="О ПРИЕМКЕ ВЫПОЛНЕННЫХ РАБОТ"/>
    </СвПродПер>
    <СвОРасч СумУдержВсегоОтч="${formatMoney(numberOrZero(settlement.totalRetention))}" СумТребВсегоОтч="${formatMoney(numberOrZero(settlement.totalClaims))}" ВсегоКОплатОтч="${formatMoney(numberOrZero(model.holdbacks.totals?.payableAmount || model.ks3.totals?.forPeriod))}">
${settlementRowsXml}
    </СвОРасч>
    <ВсегоАктОтч СтТовБезНДСВсего="${formatMoney(numberOrZero(model.ks3.totals?.forPeriod))}">
      <СумНалВсего>${formatMoney(numberOrZero(model.ks3.totals?.vat))}</СумНалВсего>
      <СумПоСтавке НалСт="20%" НалБаза="${formatMoney(numberOrZero(model.ks3.totals?.forPeriod))}">
        <СумНДС>${formatMoney(numberOrZero(model.ks3.totals?.vat))}</СумНДС>
      </СумПоСтавке>
    </ВсегоАктОтч>
    <НастрФормДок ПрНДСВИтог="${xmlEscape(constants.vatCalcInTotalOnly || '0')}" ПрНакИтог="${xmlEscape(constants.cumulativeMode || '0')}" ПрИндЦен="${xmlEscape(constants.priceIndexYear || '0000')}" ПрСведРасчСогл="${xmlEscape(constants.requiresSettlementApproval || '0')}"/>
    <ПодписантПодр>
      <Подписант>
        <ФИО Фамилия="${xmlEscape(signer.family)}" Имя="${xmlEscape(signer.name)}"${signerAttr}/>
      </Подписант>
    </ПодписантПодр>
  </Документ>
</Файл>
`;
}

function computeSheetTotals(sheet) {
  const gross = sheet.rows
    .filter((row) => row.type === 'item')
    .reduce((sum, row) => sum + numberOrZero(computeRowEffectiveAmount(row)), 0);
  const vatRate = numberOrZero(sheet.vatRate);
  const vat = vatRate ? round2(gross * vatRate / (100 + vatRate)) : 0;
  const base = round2(gross - vat);
  const breakdown = { work: 0, metal: 0, frame: 0, concrete: 0, misc: 0, material: 0 };

  sheet.rows.filter((row) => row.type === 'item').forEach((row) => {
    const category = row.category || 'work';
    breakdown[category] = round2((breakdown[category] || 0) + numberOrZero(computeRowEffectiveAmount(row)));
  });

  return { gross: round2(gross), vat, base, breakdown };
}

function computeHoldbackRow(row) {
  const ks2Amount = numberOrZero(row.ks2Amount);
  const advanceReceived = numberOrZero(row.advanceReceived);
  // По подтверждённой логике Excel:
  // F и G заполняются вручную, H считается автоматически как F - G.
  const previousBalance = row.previousBalance == null ? advanceReceived : numberOrZero(row.previousBalance);
  const closingAmount = numberOrZero(row.closingAmount);
  const retentionRate = numberOrZero(row.retentionRate || 0);
  const nextBalance = round2(Math.max(previousBalance - closingAmount, 0));
  if (row.kind === 'subitem') {
    return { nextBalance, retentionAmount: 0, payableAmount: 0 };
  }
  const retentionAmount = round2(ks2Amount * retentionRate / 100);
  const payableAmount = round2(ks2Amount - closingAmount - retentionAmount);
  return { nextBalance, retentionAmount, payableAmount };
}

function findHoldbackSectionIndex(index) {
  let current = index;
  while (current > 0 && (app.state.holdbacks.rows[current]?.kind || 'section') === 'subitem') {
    current -= 1;
  }
  return current;
}

function buildHoldbackGroups(sheetId = null) {
  const groups = [];
  let currentGroup = null;

  app.state.holdbacks.rows.forEach((row, index) => {
    const kind = row.kind || 'section';
    if (kind !== 'subitem' || !currentGroup) {
      currentGroup = { section: { row, index }, subitems: [] };
      groups.push(currentGroup);
      return;
    }
    currentGroup.subitems.push({ row, index });
  });

  if (!sheetId) return groups;
  return groups.filter((group) => String(group.section.row.ks2SheetId || '') === String(sheetId));
}

function renderHoldbackGroup(group) {
  const { section, subitems } = group;
  const sectionComputed = computeHoldbackSectionComputed(group);

  const sectionRow = `
    <tr class="holdback-section-row">
      ${renderHoldbackSectionCells(section.index, section.row, sectionComputed)}
      ${renderHoldbackSectionMiddleCells(section.index, sectionComputed, subitems.length)}
      ${renderHoldbackSectionRightCells(section.index, section.row, sectionComputed)}
      <td class="actions-cell">${renderHoldbackRowActions(section.index, 'section')}</td>
    </tr>
  `;

  const subitemRows = subitems.map((entry, subIndex) => {
    const subComputed = computeHoldbackRow(entry.row);
    return `
      <tr class="holdback-subitem-row">
        <td class="holdback-subitem-indent"></td>
        <td class="holdback-subitem-indent"></td>
        <td class="holdback-subitem-indent"></td>
        <td class="subitem-money-cell">${renderTableInput(`holdbacks.rows.${entry.index}.advanceReceived`, formatEditableNumber(entry.row.advanceReceived), 'number')}</td>
        <td class="subitem-doc-cell">${renderTableInput(`holdbacks.rows.${entry.index}.advanceDoc`, entry.row.advanceDoc, 'string', '№, дата документа')}</td>
        <td class="subitem-money-cell">${renderTableInput(`holdbacks.rows.${entry.index}.previousBalance`, formatEditableNumber(entry.row.previousBalance), 'number')}</td>
        <td class="subitem-money-cell">${renderTableInput(`holdbacks.rows.${entry.index}.closingAmount`, formatEditableNumber(entry.row.closingAmount), 'number')}</td>
        <td class="subitem-result-cell">${renderTableComputed(`holdbacks.rows.${entry.index}.__nextBalance`, `<span>${formatMoney(subComputed.nextBalance)}</span>`)}</td>
        <td class="holdback-subitem-right">${subIndex === 0 ? '<span class="holdback-subitem-caption">Подпункты / документы по разделу</span>' : ''}</td>
        <td class="holdback-subitem-right"></td>
        <td class="holdback-subitem-right"></td>
        <td class="subitem-comment-cell">${renderTableTextarea(`holdbacks.rows.${entry.index}.comment`, entry.row.comment, 'Комментарий подпункта')}</td>
        <td class="actions-cell">${renderHoldbackRowActions(entry.index, 'subitem')}</td>
      </tr>
    `;
  }).join('');

  return sectionRow + subitemRows;
}

function renderHoldbackSectionCells(rowIndex, row, computed) {
  return `
    <td class="holdback-section-cell holdback-section-title">
      ${renderTableTextarea(`holdbacks.rows.${rowIndex}.name`, row.name, 'Наименование раздела / акта')}
      <div class="holdback-doc-grid">
        ${renderInput('Документ гарантийного удержания', `holdbacks.rows.${rowIndex}.retentionDocName`, row.retentionDocName, 'string', 'half')}
        ${renderInput('Номер документа', `holdbacks.rows.${rowIndex}.retentionDocNumber`, row.retentionDocNumber, 'string', 'quarter')}
        ${renderInput('Дата документа', `holdbacks.rows.${rowIndex}.retentionDocDate`, row.retentionDocDate, 'string', 'quarter')}
        ${renderTextarea('Доп. сведения документа', `holdbacks.rows.${rowIndex}.retentionDocExtra`, row.retentionDocExtra, 'half')}
      </div>
    </td>
    <td class="holdback-section-cell">${renderTableInput(`holdbacks.rows.${rowIndex}.ks2Amount`, formatEditableNumber(row.ks2Amount), 'number')}</td>
    <td class="holdback-section-cell">${renderTableInput(`holdbacks.rows.${rowIndex}.materialsUsed`, formatEditableNumber(row.materialsUsed), 'number')}</td>
  `;
}


function renderHoldbackSectionMiddleCells(rowIndex, computed, subitemCount) {
  // Логика Excel для раздела удержаний:
  // D = сумма подпунктов по полученному авансу
  // E = служебное поле по подпунктам / документам
  // F = сумма подпунктов по незакрытому остатку прошлого периода
  // G = сумма подпунктов по сумме закрытия
  // H = сумма подпунктов по остатку к закрытию следующего периода
  return `
    <td class="holdback-section-cell holdback-middle-result">${renderTableComputed(`holdbacks.rows.${rowIndex}.__advanceReceived`, `<span>${formatMoney(computed.advanceReceived)}</span>`)}</td>
    <td class="holdback-section-cell holdback-middle-doc">${renderTableComputed(`holdbacks.rows.${rowIndex}.__docCount`, `<span>${subitemCount ? `${subitemCount} подп.` : '—'}</span>`)}</td>
    <td class="holdback-section-cell holdback-middle-result">${renderTableComputed(`holdbacks.rows.${rowIndex}.__previousBalance`, `<span>${formatMoney(computed.previousBalance)}</span>`)}</td>
    <td class="holdback-section-cell holdback-middle-result">${renderTableComputed(`holdbacks.rows.${rowIndex}.__closingAmount`, `<span>${formatMoney(computed.closingAmount)}</span>`)}</td>
    <td class="holdback-section-cell holdback-middle-result">${renderTableComputed(`holdbacks.rows.${rowIndex}.__nextBalance`, `<span>${formatMoney(computed.nextBalance)}</span>`)}</td>
  `;
}

function renderHoldbackSectionRightCells(rowIndex, row, computed) {
  return `
    <td class="holdback-section-cell holdback-percent-cell">${renderTableInput(`holdbacks.rows.${rowIndex}.retentionRate`, formatEditableNumber(row.retentionRate), 'number')}</td>
    <td class="holdback-section-cell holdback-result-cell">${renderTableComputed(`holdbacks.rows.${rowIndex}.__retentionAmount`, `<span>${formatMoney(computed.retentionAmount)}</span>`)}</td>
    <td class="holdback-section-cell holdback-result-cell">${renderTableComputed(`holdbacks.rows.${rowIndex}.__payableAmount`, `<span>${formatMoney(computed.payableAmount)}</span>`)}</td>
    <td class="holdback-section-cell holdback-comment-cell">${renderTableTextarea(`holdbacks.rows.${rowIndex}.comment`, row.comment, 'Комментарий по разделу')}</td>
  `;
}

function computeHoldbackSectionComputed(group) {
  const sectionRow = group.section.row;
  const ks2Amount = numberOrZero(sectionRow.ks2Amount);
  const retentionRate = numberOrZero(sectionRow.retentionRate || 0);

  const subTotals = group.subitems.reduce((acc, item) => {
    const rowComputed = computeHoldbackRow(item.row);
    acc.advanceReceived += numberOrZero(item.row.advanceReceived);
    acc.previousBalance += numberOrZero(item.row.previousBalance == null ? item.row.advanceReceived : item.row.previousBalance);
    acc.closingAmount += numberOrZero(item.row.closingAmount);
    acc.nextBalance += rowComputed.nextBalance;
    return acc;
  }, { advanceReceived: 0, previousBalance: 0, closingAmount: 0, nextBalance: 0 });

  const retentionAmount = round2(ks2Amount * retentionRate / 100);
  // Подтверждённая формула Excel для строки раздела: J = B - ΣG - I.
  const payableAmount = round2(ks2Amount - subTotals.closingAmount - retentionAmount);

  return {
    ...subTotals,
    retentionAmount,
    payableAmount,
  };
}

function buildAutoSettlementRowsFromHoldbacks() {
  const groups = buildHoldbackGroups();
  const rows = [];

  groups.forEach((group) => {
    const section = group.section.row;
    const computed = computeHoldbackSectionComputed(group);

    if (computed.retentionAmount > 0) {
      rows.push({
        source: 'section-retention',
        kind: 'withhold',
        kindCode: '32',
        sectionName: section.name || '',
        amount: computed.retentionAmount,
        documentRef: '',
        customKindText: '',
        comment: section.comment || '',
      });
    }

    group.subitems.forEach((item) => {
      const row = item.row;
      const closingAmount = numberOrZero(row.closingAmount);
      if (closingAmount > 0) {
        rows.push({
          source: 'subitem-advance-closing',
          kind: 'withhold',
          kindCode: '31',
          sectionName: section.name || '',
          amount: closingAmount,
          documentRef: row.advanceDoc || '',
          customKindText: '',
          comment: row.comment || '',
        });
      }
    });
  });

  return rows;
}

function buildHoldbacksXmlSettlementModel() {
  const autoRows = buildAutoSettlementRowsFromHoldbacks();
  const manualRows = (app.state.xmlExtras.settlementRows || []).map((row, rowIndex) => ({
    rowIndex,
    ...prepareSettlementRow(row),
    source: 'manual',
  }));

  const activeManualRows = manualRows.filter((row) => {
    const amount = numberOrZero(row.amount);
    return amount > 0 || row.documentRef || row.comment || row.customKindText;
  });
  const exportManualRows = activeManualRows.filter((row) => numberOrZero(row.amount) > 0);

  const settlementRows = [
    ...exportManualRows,
    ...autoRows,
  ];

  const totalRetention = settlementRows.reduce((sum, row) => (
    normalizeSettlementKind(row.kind) === 'withhold' ? sum + numberOrZero(row.amount) : sum
  ), 0);
  const totalClaims = settlementRows.reduce((sum, row) => (
    normalizeSettlementKind(row.kind) === 'claim' ? sum + numberOrZero(row.amount) : sum
  ), 0);

  const representativeRow = exportManualRows.find((row) => row.isPrimary)
    || chooseRepresentativeSettlementRow(settlementRows, totalClaims, totalRetention)
    || null;

  return {
    totalRetention,
    totalClaims,
    settlementRows,
    autoRows,
    manualRows,
    representativeRow,
  };
}

function applyRowSign(value, row) {
  if (value == null) return null;
  return isCorrectionRow(row) ? round2(-Math.abs(value)) : value;
}

function firstNumberOrNull(...values) {
  for (const value of values) {
    const numeric = numberOrNull(value);
    if (numeric != null) return numeric;
  }
  return null;
}

function normalizeExpenseType(value, row = {}) {
  if (row?.type && row.type !== 'item') return '1';
  const raw = String(value ?? row?.expenseType ?? row?.typeZatr ?? '').trim();
  if (EXPENSE_TYPE_OPTIONS[raw]) return raw;
  return '1';
}

function defaultCategoryForExpenseType(value) {
  switch (normalizeExpenseType(value)) {
    case '3':
    case '4':
    case '6':
      return 'material';
    case '5':
      return 'misc';
    case '2':
    case '1':
    default:
      return 'work';
  }
}

function expenseTypeLabel(value) {
  return EXPENSE_TYPE_OPTIONS[normalizeExpenseType(value)] || EXPENSE_TYPE_OPTIONS['1'];
}

function renderExpenseTypeMenuItems(sheetIndex, rowIndex = null, correctionAction = null) {
  return Object.entries(EXPENSE_TYPE_OPTIONS).map(([code, label]) => {
    const rowAttr = rowIndex == null ? '' : ` data-row-index="${rowIndex}"`;
    const action = correctionAction || 'insert-row-after';
    const kindAttr = correctionAction ? '' : ' data-row-kind="item"';
    return `<button class="row-action-menu-item" data-action="${action}" data-expense-type="${code}" data-sheet-index="${sheetIndex}"${rowAttr}${kindAttr}>+ ${escapeHtml(label)}</button>`;
  }).join('');
}

function hasNegativeCorrectionSignals(row = {}) {
  return ['effectiveAmount', 'effectiveQuantity', 'effectiveFromStart', 'effectiveQuantityFromStart', 'amount', 'quantity', 'fromStart', 'amountFromStart', 'quantityFromStart']
    .some((key) => {
      const numeric = numberOrNull(row?.[key]);
      return numeric != null && numeric < 0;
    });
}

function normalizeCalcMode(value, row = {}) {
  const normalized = String(value ?? '').trim();
  const lowered = normalized.toLowerCase();
  if (['errorcorrection', 'error_correction', 'pasterror', 'error', 'mistake'].includes(lowered)) return 'errorCorrection';
  if (['newcircumstances', 'new_circumstances', 'newcircumstance', 'new', 'subtract', 'correction', 'corrective'].includes(lowered)) return 'newCircumstances';
  if (String(row?.correctionKind || '').toLowerCase() === 'errorcorrection') return 'errorCorrection';
  if (String(row?.correctionKind || '').toLowerCase() === 'newcircumstances') return 'newCircumstances';
  if (row?.isCorrection || hasNegativeCorrectionSignals(row)) return 'newCircumstances';
  return 'normal';
}

function getCorrectionKind(row) {
  const mode = normalizeCalcMode(row?.calcMode, row);
  if (mode === 'errorCorrection' || mode === 'newCircumstances') return mode;
  return null;
}

function isCorrectionRow(row) {
  return row?.type === 'item' && getCorrectionKind(row) != null;
}

function correctionModeLabel(row) {
  return getCorrectionKind(row) === 'errorCorrection' ? 'испр. ошибок' : 'новые обстоятельства';
}

function computeRowDisplayAmount(row) {
  if (row.type !== 'item') return null;
  const quantity = numberOrNull(row.quantity);
  const price = numberOrNull(row.price);
  if (quantity == null || price == null) {
    const fallback = numberOrNull(row.amount);
    return fallback == null ? null : round2(Math.abs(fallback));
  }
  return round2(Math.abs(quantity * price));
}

function computeRowEffectiveAmount(row) {
  const displayAmount = computeRowDisplayAmount(row);
  return applyRowSign(displayAmount, row);
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

function createBlankItemRowByExpenseType(expenseType = '1', overrides = {}) {
  const normalizedType = normalizeExpenseType(expenseType);
  return createBlankRow('item', {
    expenseType: normalizedType,
    category: defaultCategoryForExpenseType(normalizedType),
    ...overrides,
  });
}

function createBlankRow(type = 'item', overrides = {}) {
  return {
    type,
    calcMode: 'normal',
    expenseType: '1',
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
    fromStart: null,
    amountFromStart: null,
    baseFromStart: null,
    cumulativeAmount: null,
    quantityFromStart: null,
    fromStartQuantity: null,
    cumulativeQuantity: null,
    ...overrides,
  };
}

function createBlankHoldbackRow(kind = 'section', ks2SheetId = '') {
  return {
    kind,
    name: '',
    ks2SheetId: ks2SheetId || (kind === 'section' && app.state?.ks2Sheets?.length === 1 ? app.state.ks2Sheets[0].id : ''),
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
    retentionDocName: 'Дополнительное соглашение о гарантийном удержании',
    retentionDocNumber: '',
    retentionDocDate: '',
    retentionDocExtra: 'Гарантийное удержание 3% от стоимости работ',
    comment: '',
  };
}

function normalizeSettlementKind(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'claim' || raw === 'видтреб' || raw === 'treb' || raw === 'requirement') return 'claim';
  return 'withhold';
}

function settlementCodeOptions(kind) {
  return normalizeSettlementKind(kind) === 'claim' ? CLAIM_TYPE_OPTIONS : WITHHOLD_TYPE_OPTIONS;
}

function normalizeSettlementCode(kind, value) {
  const options = settlementCodeOptions(kind);
  const raw = String(value ?? '').trim().padStart(2, '0');
  if (options[raw]) return raw;
  return normalizeSettlementKind(kind) === 'claim' ? '01' : '31';
}

function settlementKindLabel(kind) {
  return normalizeSettlementKind(kind) === 'claim' ? 'ВидТреб' : 'ВидУдерж';
}

function settlementCodeLabel(kind, code) {
  const normalizedKind = normalizeSettlementKind(kind);
  const normalizedCode = normalizeSettlementCode(normalizedKind, code);
  return settlementCodeOptions(normalizedKind)[normalizedCode] || `${settlementKindLabel(normalizedKind)} ${normalizedCode}`;
}

function isSettlementOtherCode(row) {
  const kind = normalizeSettlementKind(row?.kind);
  const code = normalizeSettlementCode(kind, row?.kindCode);
  return (kind === 'claim' && code === '05') || (kind === 'withhold' && code === '36');
}

function prepareSettlementRow(row = {}) {
  const kind = normalizeSettlementKind(row.kind ?? row.kindLabel ?? row.type ?? row.branch);
  const kindCode = normalizeSettlementCode(kind, row.kindCode ?? row.code);
  return {
    source: row.source || 'manual',
    kind,
    kindCode,
    amount: numberOrNull(row.amount),
    documentRef: row.documentRef ?? row.advanceDoc ?? '',
    customKindText: row.customKindText ?? row.otherKindText ?? row.customLabel ?? '',
    comment: row.comment ?? '',
    isPrimary: Boolean(row.isPrimary),
  };
}

function createBlankSettlementRow(presetKey = 'withholdAdvance', overrides = {}) {
  const preset = SETTLEMENT_ROW_PRESETS[presetKey] || SETTLEMENT_ROW_PRESETS.withholdAdvance;
  return prepareSettlementRow({
    source: 'manual',
    kind: preset.kind,
    kindCode: preset.kindCode,
    amount: null,
    documentRef: '',
    customKindText: '',
    comment: preset.label || '',
    ...overrides,
  });
}

function chooseRepresentativeSettlementRow(rows, totalClaims = 0, totalRetention = 0) {
  if (!rows.length) return null;
  const claimRows = rows.filter((row) => normalizeSettlementKind(row.kind, row.kindCode) === 'claim');
  const withholdRows = rows.filter((row) => normalizeSettlementKind(row.kind, row.kindCode) === 'withhold');
  if (numberOrZero(totalClaims) > 0 && numberOrZero(totalRetention) <= 0 && claimRows.length) return claimRows[0];
  if (numberOrZero(totalRetention) > 0 && numberOrZero(totalClaims) <= 0 && withholdRows.length) {
    return withholdRows.find((row) => String(row.kindCode || '') === '32')
      || withholdRows.find((row) => String(row.kindCode || '') === '31')
      || withholdRows[0];
  }
  return rows[0];
}

function buildRepresentativeSettlementLabel(row) {
  if (!row) return 'Пока нет строки для XSD-ready выгрузки';
  const parts = [settlementCodeLabel(row.kind, row.kindCode)];
  if (row.amount != null) parts.push(formatMoney(numberOrZero(row.amount)));
  if (row.documentRef) parts.push(row.documentRef);
  if (isSettlementOtherCode(row) && row.customKindText) parts.push(`Иной вид: ${row.customKindText}`);
  if (row.source === 'manual') parts.push('ручная');
  if (row.source === 'section-retention' || row.source === 'subitem-advance-closing') parts.push('авто из удержаний');
  return parts.join(' · ');
}

function buildXmlBindingTitle(binding) {
  const statusTitle = binding.status === 'direct'
    ? 'Напрямую попадает в XML'
    : binding.status === 'derived'
      ? 'Косвенно влияет на XML / вычисляется'
      : 'Не передается в XML';
  const lines = [statusTitle];
  if (binding.targets?.length) {
    lines.push(...binding.targets.map((item) => `• ${item}`));
  }
  if (binding.note) {
    lines.push('', binding.note);
  }
  if (binding.snippet) {
    lines.push('', binding.snippet);
  }
  return lines.join('\n').trim();
}

function xmlBinding(statusOrIncluded, targets = [], note = '', snippet = '') {
  const status = typeof statusOrIncluded === 'string'
    ? statusOrIncluded
    : (statusOrIncluded ? 'direct' : 'unused');
  const binding = {
    status,
    included: status !== 'unused',
    targets,
    note,
    snippet,
  };
  binding.title = buildXmlBindingTitle(binding);
  return binding;
}

function getLogicBundleCached() {
  return app.logicBundle || buildLogicBundle();
}

function formatXmlScalar(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(round2(value));
  return String(value);
}

function buildXmlTagSnippet(tag, attrs = {}, selfClosing = true) {
  const pairs = Object.entries(attrs)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}="${String(value).replaceAll('"', '&quot;')}"`);
  return selfClosing ? `<${tag}${pairs.length ? ` ${pairs.join(' ')}` : ''} />` : `<${tag}${pairs.length ? ` ${pairs.join(' ')}` : ''}>…</${tag}>`;
}

function buildKs2RowXmlSnippet(sheetIndex, rowIndex) {
  const row = app.state.ks2Sheets?.[sheetIndex]?.rows?.[rowIndex];
  if (!row) return '';
  if (row.type === 'note') return '';
  if (row.type === 'section') {
    return buildXmlTagSnippet('Раздел', {
      НаимРаздел: row.name || '',
      ПозРаздСмет: row.estimateNo || '',
    }, false);
  }
  const amount = computeRowDisplayAmount(row);
  const vatRate = numberOrZero(app.state.ks2Sheets?.[sheetIndex]?.vatRate) || 20;
  const vatAmount = amount == null ? null : round2(numberOrZero(amount) * vatRate / 100);
  const attrs = {
    НомПоз: row.lineNo || '',
    ПозСмет: row.estimateNo || '',
    НаимТов: row.name || '',
    НаимЕдИзм: row.unit || '',
    КолТов: row.quantity != null ? formatXmlScalar(row.quantity) : '',
    ЦенаТов: row.price != null ? formatXmlScalar(row.price) : '',
    СтТовБезНДС: amount != null ? formatXmlScalar(amount) : '',
    СтТовУчНал: amount != null ? formatXmlScalar(round2(numberOrZero(amount) + numberOrZero(vatAmount))) : '',
    ТипЗатр: normalizeExpenseType(row.expenseType, row),
  };
  return buildXmlTagSnippet('СвВидРаб', attrs);
}

function findHoldbackGroupEntry(rowIndex) {
  const groups = buildHoldbackGroups();
  for (const group of groups) {
    if (group.section.index === rowIndex) return { kind: 'section', group, row: group.section.row, subIndex: -1 };
    const subIndex = group.subitems.findIndex((item) => item.index === rowIndex);
    if (subIndex !== -1) return { kind: 'subitem', group, row: group.subitems[subIndex].row, subIndex };
  }
  return null;
}

function buildHoldbackXmlSnippet(rowIndex) {
  const entry = findHoldbackGroupEntry(rowIndex);
  if (!entry) return '';
  if (entry.kind === 'section') {
    const computed = computeHoldbackSectionComputed(entry.group);
    return [
      '<ИнфПолСвОРасч>',
      '  <ТекстИнф Идентиф="RET_BLOCK" Значение="RET32_SEC" />',
      '  <ТекстИнф Идентиф="RET_KIND" Значение="32" />',
      `  <ТекстИнф Идентиф="RET_SEC_NAME" Значение="${(entry.row.name || '').replaceAll('"', '&quot;')}" />`,
      `  <ТекстИнф Идентиф="RET32_RATE" Значение="${formatXmlScalar(entry.row.retentionRate)}" />`,
      `  <ТекстИнф Идентиф="RET32_BASE" Значение="${formatXmlScalar(entry.row.ks2Amount)}" />`,
      `  <ТекстИнф Идентиф="RET32_SUM" Значение="${formatXmlScalar(computed.retentionAmount)}" />`,
      '</ИнфПолСвОРасч>',
    ].join('\n');
  }
  const nextBalance = computeHoldbackRow(entry.row).nextBalance;
  return [
    '<ИнфПолСвОРасч>',
    '  <ТекстИнф Идентиф="RET_BLOCK" Значение="ADV31_DOC" />',
    '  <ТекстИнф Идентиф="RET_KIND" Значение="31" />',
    `  <ТекстИнф Идентиф="RET_DOC_REF" Значение="${(entry.row.advanceDoc || '').replaceAll('"', '&quot;')}" />`,
    `  <ТекстИнф Идентиф="ADV31_IN" Значение="${formatXmlScalar(entry.row.advanceReceived)}" />`,
    `  <ТекстИнф Идентиф="ADV31_PREV" Значение="${formatXmlScalar(entry.row.previousBalance)}" />`,
    `  <ТекстИнф Идентиф="ADV31_CLOSE" Значение="${formatXmlScalar(entry.row.closingAmount)}" />`,
    `  <ТекстИнф Идентиф="ADV31_NEXT" Значение="${formatXmlScalar(nextBalance)}" />`,
    '</ИнфПолСвОРасч>',
  ].join('\n');
}

function buildSettlementRowXmlSnippet(index) {
  const row = prepareSettlementRow(app.state.xmlExtras?.settlementRows?.[index] || {});
  const tag = row.kind === 'claim' ? 'ВидТреб' : 'ВидУдерж';
  const otherTag = row.kind === 'claim' ? 'ИнВидТреб' : 'ИнВидУдерж';
  const otherSnippet = isSettlementOtherCode(row) && row.customKindText
    ? `
  <${otherTag}>${row.customKindText}</${otherTag}>`
    : '';
  const docSnippet = row.documentRef
    ? `
  <ДокПодтСумУд><ТипИдДок НаимДок="Документ-основание" НомерДок="${row.documentRef.replaceAll('"', '&quot;')}" /></ДокПодтСумУд>`
    : '';
  return `<УчетТребУдерж СумТребУдерж="${formatXmlScalar(row.amount)}">
  <${tag}>${row.kindCode}</${tag}>${otherSnippet}${docSnippet}
</УчетТребУдерж>`;
}

function buildTraceableGoodsSnippet(index) {
  const row = app.state.xmlExtras?.traceableGoods?.[index] || {};
  return buildXmlTagSnippet('СвПрослежСтройка', {
    НомТовПрослеж: row.registrationNumber || '',
    ЕдИзмПрослеж: row.unitCode || '',
    НаимЕдИзмПрослеж: row.unitName || '',
    КолВЕдПрослеж: row.quantity != null ? formatXmlScalar(row.quantity) : '',
  });
}

function staticXmlBinding(path) {
  const bindings = {
    'common.okudKs2': ['ИнфПолФХЖ1 → form.okudKs2'],
    'common.okudKs3': { included: false, note: 'Форма КС-3 теперь передается отдельным Excel-документом и в P XML не используется.' },
    'common.objectOkpo': ['ИнфПолФХЖ1 → form.objectOkpo'],
    'common.okdpCode': ['ИнфПолФХЖ1 → form.okdpCode'],
    'common.currencyCode': ['СвАктСдПр/@КодОКВДог', 'ДенИзм/@КодОКВ', 'ИнфПолФХЖ1 → form.currencyCode'],
    'common.currencyName': ['ДенИзм/@НаимОКВ', 'ИнфПолФХЖ1 → form.currencyName'],
    'common.contractNumber': ['СвАктСдПр/ИдДог/ТипИдДок/@НомерДок', 'ОснСдачи/ТипИдДок/@НомерДок'],
    'common.contractDate': ['СвАктСдПр/ИдДог/ТипИдДок/@ДатаДок', 'ОснСдачи/ТипИдДок/@ДатаДок'],
    'common.operationType': ['СвПродПер/СвПер/@СодОпер'],
    'common.developerName': ['ИнфПолФХЖ1 → developer.name'],
    'common.developerOkpo': ['ИнфПолФХЖ1 → developer.okpo'],
    'common.techCustomerName': ['СвЗак/СвСторДог/ИдСв/СвЮЛУч/@НаимОрг', 'ИнфПолФХЖ1 → techCustomer.name'],
    'common.techCustomerOkpo': ['СвЗак/СвСторДог/@ОКПО', 'ИнфПолФХЖ1 → techCustomer.okpo'],
    'common.contractorName': ['СвПодр/СвСторДог/ИдСв/СвЮЛУч/@НаимОрг', 'Документ/@НаимЭкСубСост (fallback)'],
    'common.contractorOkpo': ['СвПодр/СвСторДог/@ОКПО'],
    'common.constructionObject': ['СвАктСдПр/@НаимОб (fallback от Стройка)'],
    'common.objectName': ['СвАктСдПр/@НаимОб'],
    'common.contractorSignerPosition': ['ПодписантПодр/Подписант/@Должн', 'ИнфПолФХЖ1 → contractor.signerPosition'],
    'common.contractorSignerName': ['ПодписантПодр/Подписант/ФИО', 'ИнфПолФХЖ1 → contractor.signerName'],
    'common.customerSignerPosition': ['ИнфПолФХЖ1 → customer.signerPosition'],
    'common.customerSignerName': ['ИнфПолФХЖ1 → customer.signerName'],
    'common.techCustomerSignerPosition': ['ИнфПолФХЖ1 → techCustomer.signerPosition'],
    'common.techCustomerSignerName': ['ИнфПолФХЖ1 → techCustomer.signerName'],
    'common.ks2DocLabel': { included: false, note: 'Используется только в визуальной форме КС-2, в XML не уходит.' },
    'common.ks2DocSubtitle': { included: false, note: 'Используется только в визуальной форме КС-2, в XML не уходит.' },
    'common.ks3DocLabel': { included: false, note: 'Используется только в визуальной форме КС-3, в XML не уходит.' },
    'common.ks3DocSubtitle': { included: false, note: 'Используется только в визуальной форме КС-3, в XML не уходит.' },
    'common.contractorSignLabel': { included: false, note: 'Только печатная подпись в web-форме.' },
    'common.customerSignLabel': { included: false, note: 'Только печатная подпись в web-форме.' },
    'common.ks2CheckedLabel': { included: false, note: 'Только печатная подпись в web-форме.' },
    'common.ks2AcceptedPosition': { included: false, note: 'Только печатный блок формы КС-2.' },
    'common.ks2AcceptedName': { included: false, note: 'Только печатный блок формы КС-2.' },
    'common.ks2CheckedPosition': { included: false, note: 'Только печатный блок формы КС-2.' },
    'common.ks2CheckedName': { included: false, note: 'Только печатный блок формы КС-2.' },
    'common.ks3DeveloperPosition': { included: false, note: 'Только печатный блок формы КС-3 / удержаний.' },
    'common.ks3DeveloperName': { included: false, note: 'Только печатный блок формы КС-3 / удержаний.' },
    'common.ks3TechCustomerPosition': { included: false, note: 'Только печатный блок формы КС-3 / удержаний.' },
    'common.ks3TechCustomerName': { included: false, note: 'Только печатный блок формы КС-3 / удержаний.' },
    'common.ks3ContractorPosition': { included: false, note: 'Только печатный блок формы КС-3 / удержаний.' },
    'common.ks3ContractorName': { included: false, note: 'Только печатный блок формы КС-3 / удержаний.' },

    'ks3.documentNumber': { included: false, note: 'Данные КС-3 больше не используются при формировании P XML по листу КС-2.' },
    'ks3.documentDate': { included: false, note: 'Данные КС-3 больше не используются при формировании P XML по листу КС-2.' },
    'ks3.periodFrom': { included: false, note: 'Данные КС-3 больше не используются при формировании P XML по листу КС-2.' },
    'ks3.periodTo': { included: false, note: 'Данные КС-3 больше не используются при формировании P XML по листу КС-2.' },
    'ks3.totals.fromStart': { included: false, note: 'Итоги КС-3 больше не участвуют в формировании P XML.' },
    'ks3.totals.fromYearStart': { included: false, note: 'Итоги КС-3 больше не участвуют в формировании P XML.' },
    'ks3.totals.forPeriod': { included: false, note: 'Итоги КС-3 больше не участвуют в формировании P XML.' },
    'ks3.totals.vat': { included: false, note: 'Итоги КС-3 больше не участвуют в формировании P XML.' },

    'xml.generated.fileId': ['Файл/@ИдФайл'],
    'xml.generated.fileDate': ['Документ/@ДатаИнфПодр'],
    'xml.generated.fileTime': ['Документ/@ВремИнфПодр'],
    'xml.generated.knd': ['Документ/@КНД'],
    'xml.generated.formatVersion': ['Файл/@ВерсФорм'],
    'xml.generated.programVersion': ['Файл/@ВерсПрог'],

    'xmlExtras.constants.isGovMunicipal': ['СвАктСдПр/ОсновСтроит/@ПрГосМун'],
    'xmlExtras.constants.vatCalcInTotalOnly': ['СвПродПер/СвПер/@ПрНДСВИтог'],
    'xmlExtras.constants.cumulativeMode': { status: 'derived', targets: ['Влияет на накопительные суммы строк и итогов XML'] },
    'xmlExtras.constants.priceIndexYear': ['СвПродПер/СвПер/@ПрИндЦен'],
    'xmlExtras.constants.requiresSettlementApproval': ['СвПродПер/СвПер/@ПрСведРасчСогл'],
    'xmlExtras.constants.diadocCompactMode': { status: 'derived', targets: ['Влияет на структуру табличной части НаимИСт/Раздел/СвВидРаб'] },

    'xmlExtras.manual.economicSubjectName': ['Документ/@НаимЭкСубСост'],
    'xmlExtras.manual.isCorrectionAct': ['СвАктСдПр/ИспрАктСдПр (наличие узла)'],
    'xmlExtras.manual.correctionNumber': ['СвАктСдПр/ИспрАктСдПр/@НомИспр'],
    'xmlExtras.manual.correctionDate': ['СвАктСдПр/ИспрАктСдПр/@ДатаИспр'],
    'xmlExtras.manual.hasEstimateChange': ['СвАктСдПр/ИзмСмет (наличие узла)'],
    'xmlExtras.manual.estimateVersionCode': ['СвАктСдПр/ИзмСмет/@КодСмет', 'СвАктСдПр/ИдСмет/ТипИдДок/@НомерДок'],
    'xmlExtras.manual.supplementDocType': ['СвАктСдПр/ИзмСмет/ИдДопСогл/ТипИдДок/@НаимДок'],
    'xmlExtras.manual.supplementDocNumber': ['СвАктСдПр/ИзмСмет/ИдДопСогл/ТипИдДок/@НомерДок'],
    'xmlExtras.manual.supplementDocDate': ['СвАктСдПр/ИзмСмет/ИдДопСогл/ТипИдДок/@ДатаДок'],
    'xmlExtras.manual.contractorInn': ['ОснДовОргСост/ИдРекСост/ИННЮЛ', 'СвПодр/СвСторДог/ИдСв/СвЮЛУч/@ИННЮЛ'],
    'xmlExtras.manual.customerInn': ['СвЗак/СвСторДог/ИдСв/СвЮЛУч/@ИННЮЛ'],
    'xmlExtras.manual.developerPostalIndex': ['СвАктСдПр/МестВыпРаб/АдрРФ/@Индекс'],
    'xmlExtras.manual.developerRegionCode': ['СвАктСдПр/МестВыпРаб/АдрРФ/@КодРегион'],
    'xmlExtras.manual.signerName': ['ПодписантПодр/Подписант/ФИО'],
    'xmlExtras.manual.signerPosition': ['ПодписантПодр/Подписант/@Должн'],
    'xmlExtras.manual.signerStatus': ['ПодписантПодр/Подписант/@СтатПодп'],
    'xmlExtras.manual.signatureType': ['ПодписантПодр/Подписант/@ТипПодпис'],
    'xmlExtras.manual.customInfoValue': ['ИнфПолФХЖ1 → customField'],
    'xmlExtras.manual.contractorPostalIndex': ['СвПодр/СвСторДог/Адрес/АдрРФ/@Индекс'],
    'xmlExtras.manual.contractorRegionCode': ['СвПодр/СвСторДог/Адрес/АдрРФ/@КодРегион'],

    'xmlExtras.manual.customerEconomicSubjectName': ['Файл Z → Документ/@НаимЭкСубСост'],
    'xmlExtras.manual.customerAuthorityDocName': ['Файл Z → ДокОснПолнПодпис/ТипИдДок/@НаимДок'],
    'xmlExtras.manual.customerAuthorityDocNumber': ['Файл Z → ДокОснПолнПодпис/ТипИдДок/@НомерДок'],
    'xmlExtras.manual.customerAuthorityDocDate': ['Файл Z → ДокОснПолнПодпис/ТипИдДок/@ДатаДок'],
    'xmlExtras.manual.customerSignerStatus': ['Файл Z → Подписант/@СтатПодп'],
    'xmlExtras.manual.customerSignatureType': ['Файл Z → Подписант/@ТипПодпис'],
    'xmlExtras.manual.customerSignatureStorageId': ['Файл Z → идентификатор хранения подписи / доверенности'],
    'xmlExtras.manual.customerAcceptanceCode': ['Файл Z → Приемка/КодПрин'],
    'xmlExtras.manual.customerAcceptanceText': ['Файл Z → Приемка/ТекстПрин'],
    'xmlExtras.manual.customerSettlementNotice': ['Файл Z → СвУведРасч/ТекстУвед'],
    'xmlExtras.manual.customerSettlementDisagreementReason': ['Файл Z → СвУведРасч/ПричНесогл'],
  };
  const entry = bindings[path];
  if (!entry) return null;
  if (Array.isArray(entry)) return xmlBinding('direct', entry);
  return xmlBinding(entry.status || (entry.included ? 'direct' : 'unused'), entry.targets || [], entry.note || '', entry.snippet || '');
}

function resolveXmlBinding(path) {
  if (!path) return xmlBinding(false, [], 'Не передается в XML 1110335.');
  const staticBindingEntry = staticXmlBinding(path);
  if (staticBindingEntry) return staticBindingEntry;

  let match = path.match(/^ks2Sheets\.(\d+)\.(title|documentNumber|documentDate|periodFrom|periodTo|basis|vatRate)$/);
  if (match) {
    const [, sheetIndex, field] = match;
    const mapping = {
      title: ['ИнфПолФХЖ1 → ks2.sheetTitle'],
      documentNumber: ['СвАктСдПр/@НомерДок', 'ИнфПолФХЖ1 → ks2.documentNumber'],
      documentDate: ['СвАктСдПр/@ДатаДок', 'ИнфПолФХЖ1 → ks2.documentDate'],
      periodFrom: ['СвПродПер/СвПер/@НачПерВДок', 'ИнфПолФХЖ1 → ks2.periodFrom'],
      periodTo: ['СвПродПер/СвПер/@ОконПерВДок', 'ИнфПолФХЖ1 → ks2.periodTo'],
      basis: ['СвАктСдПр/ОснСдачи/ТипИдДок/@НаимДок', 'ИнфПолФХЖ1 → ks2.basis'],
      vatRate: ['ИнфПолФХЖ1 → ks2.vatRate', 'влияет на суммы НДС по строкам XML'],
    };
    const status = field === 'vatRate' ? 'derived' : 'direct';
    return xmlBinding(status, mapping[field] || [], '', buildXmlTagSnippet('НаимИСт', { НомДок: app.state.ks2Sheets?.[Number(sheetIndex)]?.documentNumber || '' }, false));
  }

  match = path.match(/^ks2Sheets\.(\d+)\.rows\.(\d+)\.(.+)$/);
  if (match) {
    const sheetIndex = Number(match[1]);
    const rowIndex = Number(match[2]);
    const field = match[3];
    const row = app.state.ks2Sheets?.[sheetIndex]?.rows?.[rowIndex];
    if (!row || row.type === 'note') {
      return xmlBinding(false, [], 'Строки типа «Примечание» в XML не попадают.');
    }
    const snippet = buildKs2RowXmlSnippet(sheetIndex, rowIndex);
    if (field === 'category' || field === 'note') {
      return xmlBinding(false, [], field === 'category' ? 'Категория нужна для UI/аналитики, в XML не уходит.' : 'Примечание строки не передается в XML 1110335.');
    }
    if (field === '__displayAmount') {
      return xmlBinding('derived', ['СвВидРаб/@СтТовБезНДС', 'СвВидРаб/@СтТовУчНал'], 'Сумма вычисляется из количества, цены, режима строки и НДС.', snippet);
    }
    if (row.type === 'section') {
      const sectionTargets = {
        type: ['Тег раздела: Раздел'],
        estimateNo: ['Раздел/@ПозРаздСмет'],
        name: ['Раздел/@НаимРаздел'],
      };
      return sectionTargets[field]
        ? xmlBinding(field === 'type' ? 'derived' : 'direct', sectionTargets[field], field === 'type' ? 'Тип строки влияет на выбор XML-тега раздела.' : '', snippet)
        : xmlBinding(false, [], 'Для раздела это поле не уходит в XML.');
    }
    const itemTargets = {
      type: ['Тег строки: СвВидРаб'],
      code: ['ИнфПолФХЖ1 → ks2.rowCode'],
      lineNo: ['СвВидРаб/@НомПоз'],
      estimateNo: ['СвВидРаб/@ПозСмет'],
      name: ['СвВидРаб/@НаимТов'],
      unit: ['СвВидРаб/@НаимЕдИзм'],
      quantity: ['СвВидРаб/@КолТов'],
      price: ['СвВидРаб/@ЦенаТов'],
      unitConsumption: ['ИнфПолФХЖ1 → ks2.unitConsumption'],
      expenseType: ['СвВидРаб/@ТипЗатр'],
      calcMode: ['СвВидРаб/@ПрИспрОш / @ПрНовОбст', 'УчОшИНовОбстСт (при корректировках)'],
    };
    return itemTargets[field]
      ? xmlBinding(field === 'type' ? 'derived' : 'direct', itemTargets[field], field === 'type' ? 'Тип строки влияет на то, будет ли создан XML-элемент СвВидРаб.' : '', snippet)
      : xmlBinding(false, [], 'Поле не уходит в XML отдельным реквизитом.');
  }

  match = path.match(/^ks3\.rows\.(\d+)\.(.+)$/);
  if (match) {
    return xmlBinding('derived', [], 'Ручные строки КС-3 напрямую не выгружаются в P XML; используются для totals и сопоставления.');
  }

  match = path.match(/^holdbacks\.rows\.(\d+)\.(.+)$/);
  if (match) {
    const rowIndex = Number(match[1]);
    const field = match[2];
    const entry = findHoldbackGroupEntry(rowIndex);
    if (!entry) return xmlBinding(false, [], 'Строка удержаний не распознана.');
    const snippet = buildHoldbackXmlSnippet(rowIndex);
    if (field === 'ks2SheetId') {
      return xmlBinding('derived', [], 'Служебная привязка к листу КС-2: управляет тем, в какой per-sheet XML попадет удержание.');
    }
    if (entry.kind === 'section') {
      const sectionTargets = {
        name: ['ИнфПолСвОРасч → RET_SEC_NAME'],
        ks2Amount: ['ИнфПолСвОРасч → RET32_BASE'],
        materialsUsed: ['ИнфПолСвОРасч → RET_MATL'],
        retentionRate: ['ИнфПолСвОРасч → RET32_RATE'],
        comment: ['ИнфПолСвОРасч → RET_NOTE'],
        __advanceReceived: ['ИнфПолСвОРасч → ADV31_IN_TOT'],
        __docCount: ['ИнфПолСвОРасч → ADV31_DOC_CNT'],
        __previousBalance: ['ИнфПолСвОРасч → ADV31_PREV_TOT'],
        __closingAmount: ['ИнфПолСвОРасч → ADV31_TOTAL'],
        __nextBalance: ['ИнфПолСвОРасч → ADV31_NEXT_TOT'],
        __retentionAmount: ['СвОРасч/@СумУдержВсегоОтч', 'ИнфПолСвОРасч → RET32_SUM'],
        __payableAmount: ['СвОРасч/@ВсегоКОплатОтч'],
      };
      return sectionTargets[field]
        ? xmlBinding(field.startsWith('__') ? 'derived' : 'direct', sectionTargets[field], field.startsWith('__') ? 'Значение вычисляется из раздела и подпунктов, затем попадает в XML.' : '', snippet)
        : xmlBinding(false, [], 'Поле раздела удержаний не попадает в XML отдельным реквизитом.');
    }
    const subTargets = {
      advanceReceived: ['ИнфПолСвОРасч → ADV31_IN'],
      advanceDoc: ['ИнфПолСвОРасч → RET_DOC_REF'],
      previousBalance: ['ИнфПолСвОРасч → ADV31_PREV'],
      closingAmount: ['ИнфПолСвОРасч → ADV31_CLOSE'],
      comment: ['ИнфПолСвОРасч → RET_NOTE'],
      __nextBalance: ['ИнфПолСвОРасч → ADV31_NEXT'],
    };
    return subTargets[field]
      ? xmlBinding(field.startsWith('__') ? 'derived' : 'direct', subTargets[field], field.startsWith('__') ? 'Значение вычисляется из подпункта и затем попадает в XML.' : '', snippet)
      : xmlBinding(false, [], 'Поле подпункта удержаний не попадает в XML отдельным реквизитом.');
  }

  match = path.match(/^xmlExtras\.settlementRows\.(\d+)\.(.+)$/);
  if (match) {
    const rowIndex = Number(match[1]);
    const field = match[2];
    const snippet = buildSettlementRowXmlSnippet(rowIndex);
    const targets = {
      kind: ['СвОРасч/УчетТребУдерж → ВидТреб / ВидУдерж'],
      kindCode: ['СвОРасч/УчетТребУдерж → ВидТреб / ВидУдерж'],
      amount: ['СвОРасч/УчетТребУдерж/@СумТребУдерж'],
      documentRef: ['СвОРасч/УчетТребУдерж/ДокПодтСумУд'],
      customKindText: ['СвОРасч/УчетТребУдерж → ИнВидТреб / ИнВидУдерж'],
      comment: ['ИнфПолСвОРасч / служебная расшифровка'],
    };
    if (field === 'isPrimary') {
      return xmlBinding('derived', [], 'Служебный флаг: выбирает, какая строка станет основной для XSD-ready XML.');
    }
    if (field === 'comment') {
      return xmlBinding(false, [], 'Комментарий settlement-строки сейчас в XML не уходит.');
    }
    return targets[field] ? xmlBinding('direct', targets[field], '', snippet) : xmlBinding(false, [], 'Поле settlement-строки не распознано.');
  }

  match = path.match(/^xmlExtras\.traceableGoods\.(\d+)\.(.+)$/);
  if (match) {
    const rowIndex = Number(match[1]);
    const field = match[2];
    const snippet = buildTraceableGoodsSnippet(rowIndex);
    const targets = {
      registrationNumber: ['СвПрослежСтройка/@НомТовПрослеж'],
      unitCode: ['СвПрослежСтройка/@ЕдИзмПрослеж'],
      unitName: ['СвПрослежСтройка/@НаимЕдИзмПрослеж'],
      quantity: ['СвПрослежСтройка/@КолВЕдПрослеж'],
    };
    return targets[field] ? xmlBinding('direct', targets[field], '', snippet) : xmlBinding(false, [], 'Поле прослеживаемости не распознано.');
  }

  return xmlBinding(false, [], 'Не передается в XML 1110335.');
}

function renderXmlIndicator(path, compact = false) {
  const binding = resolveXmlBinding(path);
  return `<span class="xml-indicator is-${binding.status} ${compact ? 'compact' : 'inline'}" title="${escapeAttr(binding.title)}" aria-label="${escapeAttr(binding.title)}"></span>`;
}

function renderFieldLabel(label, path) {
  return `<label class="field-label"><span>${escapeHtml(label)}</span>${renderXmlIndicator(path)}</label>`;
}

function renderTableWrapper(path, innerHtml, extraClass = '') {
  const binding = resolveXmlBinding(path);
  return `<div class="xml-cell-wrap ${extraClass} is-${binding.status}" title="${escapeAttr(binding.title)}">${innerHtml}${renderXmlIndicator(path, true)}</div>`;
}

function renderTableInput(path, value, valueType = 'string', placeholder = '') {
  return renderTableWrapper(path, `<input data-path="${path}" ${valueType !== 'string' ? `data-value-type="${valueType}"` : ''} value="${escapeAttr(value ?? '')}" ${placeholder ? `placeholder="${escapeAttr(placeholder)}"` : ''} />`);
}

function renderTableTextarea(path, value, placeholder = '') {
  return renderTableWrapper(path, `<textarea data-path="${path}" ${placeholder ? `placeholder="${escapeAttr(placeholder)}"` : ''}>${escapeHtml(value ?? '')}</textarea>`);
}

function renderTableSelect(path, selected, options) {
  return renderTableWrapper(path, `<select data-path="${path}">${Object.entries(options).map(([value, text]) => `<option value="${escapeAttr(value)}" ${String(selected) === String(value) ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select>`);
}

function renderTableComputed(path, html, extraClass = '') {
  return renderTableWrapper(path, html, extraClass);
}

function renderInput(label, path, value, valueType = 'string', size = '') {
  return `
    <div class="field ${size}">
      ${renderFieldLabel(label, path)}
      <input data-path="${path}" data-value-type="${valueType}" value="${escapeAttr(value ?? '')}" />
    </div>
  `;
}

function renderTextarea(label, path, value, size = 'half') {
  return `
    <div class="field ${size}">
      ${renderFieldLabel(label, path)}
      <textarea data-path="${path}">${escapeHtml(value ?? '')}</textarea>
    </div>
  `;
}

function renderReadonly(label, value, size = '', path = '') {
  return `
    <div class="field ${size}">
      ${renderFieldLabel(label, path)}
      <div class="readonly">${escapeHtml(String(value ?? ''))}</div>
    </div>
  `;
}

function renderKs2SheetAddMenu(sheetIndex) {
  const menuOpen = app.state.ui.sheetAddMenu === sheetIndex;
  return `
    <div class="row-action-stack inline-add-stack">
      <button class="mini" data-action="toggle-sheet-add-menu" data-sheet-index="${sheetIndex}">+ Добавить позицию</button>
      ${menuOpen ? `
        <div class="row-action-menu row-action-menu-wide">
          ${renderExpenseTypeMenuItems(sheetIndex)}
        </div>
      ` : ''}
    </div>
  `;
}

function renderSelect(label, path, selected, options, size = '') {
  return `
    <div class="field ${size}">
      ${renderFieldLabel(label, path)}
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
  if (type === 'boolean') {
    return Boolean(value);
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
