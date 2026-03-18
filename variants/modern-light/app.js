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
  exportXml: document.getElementById('export-xml'),
  addSheet: document.getElementById('add-ks2-sheet'),
  toggleSidebar: document.getElementById('toggle-sidebar'),
  toggleHeaders: document.getElementById('toggle-headers'),
  toggleSignatures: document.getElementById('toggle-signatures'),
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
          if (Array.isArray(data.errors) && data.errors.length) {
            errorMessage = data.errors.slice(0, 3).map((err) => `строка ${err.line}: ${err.message}`).join(' | ');
          } else if (data.error) {
            errorMessage = data.error;
          }
        } catch (_) {}
        flash(`XML не выгружен: ${errorMessage}`);
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
      flash('XML прошёл XSD-проверку и выгружен.');
    } catch (error) {
      flash(`Не удалось выполнить XSD-проверку: ${error.message}`);
    } finally {
      refs.exportXml.disabled = false;
      refs.exportXml.textContent = 'Экспорт XML (XSD-ready)';
    }
  });

  refs.addSheet.addEventListener('click', () => {
    app.state.ks2Sheets.push(createBlankSheet(app.state.ks2Sheets.length + 1));
    app.state.ui.activePane = `ks2:${app.state.ks2Sheets.length - 1}`;
    render();
    flash('Добавлен новый лист КС-2.');
  });

  refs.toggleSidebar?.addEventListener('click', () => {
    app.state.ui.sidebarOpen = !(app.state.ui.sidebarOpen ?? true);
    render();
  });
  refs.toggleHeaders?.addEventListener('click', () => {
    app.state.common.showDocumentHeaders = !app.state.common.showDocumentHeaders;
    render();
  });
  refs.toggleSignatures?.addEventListener('click', () => {
    app.state.common.showDocumentSignatures = !app.state.common.showDocumentSignatures;
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

  refs.sidebar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-pane]');
    if (!button) return;
    app.state.ui.activePane = button.dataset.pane;
    render();
  });

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

  if (action === 'add-item-row') {
    clearTransientRowUi();
    app.state.ks2Sheets[Number(sheetIndex)].rows.push(createBlankRow('item'));
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
    app.state.ks2Sheets[rowCoords.sheetIndex].rows.splice(rowCoords.rowIndex + 1, 0, createBlankRow(rowKind || 'item'));
    render();
    flash('Строка добавлена.');
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

  if (action === 'add-holdback-row') {
    app.state.holdbacks.rows.push(createBlankHoldbackRow('section'));
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
    app.state.holdbacks.rows.splice(idx + 1, 0, createBlankHoldbackRow('section'));
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
    app.state.holdbacks.rows.splice(insertAt, 0, createBlankHoldbackRow('subitem'));
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
  data.ui.sidebarOpen = data.ui.sidebarOpen ?? true;
  data.ui.rowActionMenu ??= null;
  data.ui.rowDeleteConfirm ??= null;
  data.ui.holdbackActionMenu ??= null;
  data.ui.holdbackDeleteConfirm ??= null;
  data.ui.columnWidths ??= {};
  data.common ??= {};
  data.holdbacks ??= { rows: [] };
  data.holdbacks.rows ??= [];
  data.xmlExtras ??= {};
  data.xmlExtras.generated ??= {};
  data.xmlExtras.constants ??= {};
  data.xmlExtras.manual ??= {};
  data.xmlExtras.traceableGoods ??= [];

  data.common.okudKs3 = data.common.okudKs3 && data.common.okudKs3 !== 'Форма по ОКУД' ? data.common.okudKs3 : '0322001';
  data.common.showDocumentHeaders = data.common.showDocumentHeaders ?? true;
  data.common.showDocumentSignatures = data.common.showDocumentSignatures ?? true;
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
    const kind = row.kind || row.type || 'section';
    const ks2Amount = numberOrZero(row.ks2Amount);
    const retentionAmount = numberOrZero(row.retentionAmount);
    const retentionRate = row.retentionRate ?? (ks2Amount ? round2((retentionAmount / ks2Amount) * 100) : 3);
    return {
      ...row,
      kind,
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
  applyColumnWidths();
}

function applyUiPreferences() {
  document.body.dataset.scale = String(normalizeScale(app.state.ui.scale));
  document.body.dataset.density = app.state.ui.compactRows ? 'compact' : 'comfortable';
  document.body.dataset.sidebar = app.state.ui.sidebarOpen ? 'open' : 'closed';

  if (refs.scaleReset) refs.scaleReset.textContent = `${normalizeScale(app.state.ui.scale)}%`;
  if (refs.densityCompact) refs.densityCompact.checked = Boolean(app.state.ui.compactRows);
  if (refs.toggleSidebar) refs.toggleSidebar.textContent = app.state.ui.sidebarOpen ? 'Скрыть меню' : 'Показать меню';
  if (refs.toggleHeaders) {
    refs.toggleHeaders.textContent = app.state.common.showDocumentHeaders ? 'Шапки: вкл' : 'Шапки: выкл';
    refs.toggleHeaders.classList.toggle('is-active', Boolean(app.state.common.showDocumentHeaders));
  }
  if (refs.toggleSignatures) {
    refs.toggleSignatures.textContent = app.state.common.showDocumentSignatures ? 'Подписи: вкл' : 'Подписи: выкл';
    refs.toggleSignatures.classList.toggle('is-active', Boolean(app.state.common.showDocumentSignatures));
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
  return Boolean(app.state.ui.rowActionMenu || app.state.ui.rowDeleteConfirm);
}

function clearTransientRowUi() {
  app.state.ui.rowActionMenu = null;
  app.state.ui.rowDeleteConfirm = null;
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
  const validation = buildLogicBundle().validation;
  refs.stats.textContent = `${app.state.ks2Sheets.length} листов КС-2 · ${totalRows} строк · общая сумма с НДС: ${formatMoney(grossTotal)} · ошибок: ${validation.errors.length} · предупреждений: ${validation.warnings.length}`;
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
      code: row.code || '',
      lineNo: row.lineNo || '',
      estimateNo: row.estimateNo || '',
      name: row.name || '',
      unit: row.unit || '',
      quantity: numberOrNull(row.quantity),
      price: numberOrNull(row.price),
      amount: numberOrNull(computeRowAmount(row)),
      unitConsumption: numberOrNull(row.unitConsumption),
      category: row.category || '',
      note: row.note || '',
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
  const ks3Totals = ks3Rows.reduce((acc, row) => {
    acc.fromStart += row.fromStart;
    acc.fromYearStart += row.fromYearStart;
    acc.forPeriod += row.forPeriod;
    acc.vat += row.vat;
    return acc;
  }, { fromStart: 0, fromYearStart: 0, forPeriod: 0, vat: 0 });

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
      document: clone(app.state.ks3),
      rows: ks3Rows,
      totals: ks3Totals,
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
  requireValue(model.common.okudKs3, 'common.okudKs3', 'ОКУД КС-3');
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

  requireValue(model.ks3.document.documentNumber, 'ks3.document.documentNumber', 'КС-3: номер документа');
  requireValue(model.ks3.document.documentDate, 'ks3.document.documentDate', 'КС-3: дата документа');
  requireValue(model.ks3.document.periodFrom, 'ks3.document.periodFrom', 'КС-3: период с');
  requireValue(model.ks3.document.periodTo, 'ks3.document.periodTo', 'КС-3: период по');

  if (!model.holdbacks.rows.length) {
    pushIssue('warning', 'holdbacks.rows', 'Удержания', 'Нет ни одной строки удержаний');
  }

  requireValue(model.xml.manual.contractorInn, 'xml.manual.contractorInn', 'ИНН подрядчика', 'warning');
  requireValue(model.xml.manual.customerInn, 'xml.manual.customerInn', 'ИНН заказчика', 'warning');

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

function renderKs3TotalsBlock(totals, vat) {
  return `
    <div class="excel-totals-block">
      <div class="excel-total-line"><span>Итого:</span><strong>${formatMoney(totals.forPeriod)}</strong></div>
      <div class="excel-total-line"><span>Сумма НДС (22%)</span><strong>${formatMoney(vat)}</strong></div>
      <div class="excel-total-line"><span>Всего с учетом НДС (22%):</span><strong>${formatMoney(totals.forPeriod + vat)}</strong></div>
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
          <button class="row-action-menu-item" data-action="insert-row-after" data-row-kind="item" data-sheet-index="${sheetIndex}" data-row-index="${rowIndex}">+ Строка</button>
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

function renderKs2Pane(sheetIndex) {
  const sheet = app.state.ks2Sheets[sheetIndex];
  if (!sheet) return '<div class="panel"><div class="empty-state">Лист КС-2 не найден.</div></div>';
  const totals = computeSheetTotals(sheet);
  const ks2TableId = `ks2-${sheetIndex}`;

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
        <div class="inline-actions">
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
              <col class="ks2-col-note" />
              <col class="ks2-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th data-table-id="${ks2TableId}" data-col-selector="ks2-col-type" data-min-width="60">Код затрат<span class="resize-handle"></span></th>
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
                <th data-table-id="${ks2TableId}" data-col-selector="ks2-col-note" data-min-width="120">Примечание<span class="resize-handle"></span></th>
                <th data-table-id="${ks2TableId}" data-col-selector="ks2-col-actions" data-min-width="24"><span class="resize-handle"></span></th>
              </tr>
              <tr class="numbering-row">
                <th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th><th>8</th><th>9</th><th>10</th><th>11</th><th>12</th><th></th>
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

      ${renderKs2TotalsBlock(sheet, totals)}
      ${app.state.common.showDocumentSignatures ? renderKs2SignatureTable(app.state.common) : ''}
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
        <h3>Автосвод по актам</h3>
        <div class="table-wrapper">
          <table class="table table-ks3-like">
            <thead>
              <tr>
                <th>#</th>
                <th>Наименование пусковых комплексов / объектов / работ</th>
                <th>С начала работ</th>
                <th>С начала года</th>
                <th>За отчетный период</th>
                <th>НДС</th>
              </tr>
              <tr class="numbering-row">
                <th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th>
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

      ${renderKs3TotalsBlock(totals, vat)}
      ${app.state.common.showDocumentSignatures ? renderKs3SignatureTable(app.state.common) : ''}
    </div>
  `;
}

function renderHoldbacksPane() {
  const groups = buildHoldbackGroups();
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
          <p class="panel-subtitle">Сложная таблица удержаний приближена к Excel: разделы, подпункты внутри раздела, отдельные итоги и действия по строкам.</p>
        </div>
        <button class="mini" data-action="add-holdback-row">+ Раздел</button>
      </div>

      ${app.state.common.showDocumentHeaders ? `
        <div class="excel-frame excel-frame-tight">
          <div class="excel-frame-title">Расчет суммы погашения авансов и гарантийного удержания</div>
          <div class="excel-frame-subtitle">за период ${escapeHtml(app.state.ks3?.periodTo || '')}</div>
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
  const settlement = model.xml.settlement || { totalRetention: 0, totalClaims: 0, settlementRows: [] };
  const firstSheet = model.ks2Sheets[0] || { document: {}, items: [] };
  const signer = splitSignerName(common.contractorSigner || common.contractorResponsible || 'Иванов Иван');
  const signerAttr = signer.patronymic ? ` Отчество="${xmlEscape(signer.patronymic)}"` : '';
  const worksXml = model.ks2Sheets.flatMap((sheet, sheetIndex) => (
    (sheet.items || []).map((item, itemIndex) => {
      const amount = numberOrZero(item.amount);
      const vat = Math.max(round2(amount * 0.2), 0);
      return `      <ВидРаб НаимТов="${xmlEscape(item.name || `Работа ${sheetIndex + 1}.${itemIndex + 1}`)}" ЦенаТов="${formatMoney(numberOrZero(item.price))}" СтТовБезНДС="${formatMoney(amount)}" НомСтр="${itemIndex + 1}" НомПоз="${xmlEscape(item.lineNo || String(itemIndex + 1))}" ТипЗатр="1" ОКЕИ_Стройка="796" НаимЕдИзм="${xmlEscape(item.unit || 'шт')}">\n        <УчОшИНовОбстСт>\n          <ОшибПрПер>\n            <УвелДен>1</УвелДен>\n            <УвелКол>1</УвелКол>\n          </ОшибПрПер>\n        </УчОшИНовОбстСт>\n        <СумНал>\n          <СумНал>${formatMoney(vat)}</СумНал>\n        </СумНал>\n      </ВидРаб>`;
    })
  )).join('\n');
  const sectionsXml = (model.holdbacks.sections || []).map((section, idx) => `      <Раздел НаимРаздел="${xmlEscape(section.name || `Раздел №${idx + 1}`)}" СтБезНДСРаздОтч="${formatMoney(numberOrZero(section.ks2Amount))}">\n${(section.subitems || []).map((sub, subIdx) => `        <СвВидРаб НаимТов="${xmlEscape(sub.advanceDoc || `Подпункт ${idx + 1}.${subIdx + 1}`)}" ЦенаТов="${formatMoney(numberOrZero(sub.advanceReceived))}" СтТовБезНДС="${formatMoney(numberOrZero(sub.closingAmount))}"/>`).join('\n') || `        <СвВидРаб НаимТов="${xmlEscape(section.name || `Раздел №${idx + 1}`)}" ЦенаТов="${formatMoney(numberOrZero(section.ks2Amount))}" СтТовБезНДС="${formatMoney(numberOrZero(section.ks2Amount))}"/>`}\n      </Раздел>`).join('\n');
  const settlementRowsXml = (settlement.settlementRows?.length ? settlement.settlementRows : [{ amount: 0, kindCode: '31' }]).map((row) => `      <УчетТребУдерж СумТребУдерж="${formatMoney(numberOrZero(row.amount))}">\n        <ВидУдерж>${xmlEscape(row.kindCode || '31')}</ВидУдерж>\n      </УчетТребУдерж>`).join('\n');

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

function buildHoldbackGroups() {
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

  return groups;
}

function renderHoldbackGroup(group) {
  const { section, subitems } = group;
  const sectionComputed = computeHoldbackSectionComputed(group);

  const sectionRow = `
    <tr class="holdback-section-row">
      ${renderHoldbackSectionCells(section.index, section.row, sectionComputed)}
      ${renderHoldbackSectionMiddleCells(sectionComputed, subitems.length)}
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
        <td class="subitem-money-cell"><input data-path="holdbacks.rows.${entry.index}.advanceReceived" data-value-type="number" value="${formatEditableNumber(entry.row.advanceReceived)}" /></td>
        <td class="subitem-doc-cell"><input data-path="holdbacks.rows.${entry.index}.advanceDoc" value="${escapeAttr(entry.row.advanceDoc)}" placeholder="№, дата документа" /></td>
        <td class="subitem-money-cell"><input data-path="holdbacks.rows.${entry.index}.previousBalance" data-value-type="number" value="${formatEditableNumber(entry.row.previousBalance)}" /></td>
        <td class="subitem-money-cell"><input data-path="holdbacks.rows.${entry.index}.closingAmount" data-value-type="number" value="${formatEditableNumber(entry.row.closingAmount)}" /></td>
        <td class="subitem-result-cell">${formatMoney(subComputed.nextBalance)}</td>
        <td class="holdback-subitem-right" colspan="4">${subIndex === 0 ? '<span class="holdback-subitem-caption">Подпункты / документы по разделу</span>' : ''}</td>
        <td class="actions-cell">${renderHoldbackRowActions(entry.index, 'subitem')}</td>
      </tr>
    `;
  }).join('');

  return sectionRow + subitemRows;
}

function renderHoldbackSectionCells(rowIndex, row, computed) {
  return `
    <td class="holdback-section-cell holdback-section-title"><textarea data-path="holdbacks.rows.${rowIndex}.name" placeholder="Наименование раздела / акта">${escapeHtml(row.name)}</textarea></td>
    <td class="holdback-section-cell"><input data-path="holdbacks.rows.${rowIndex}.ks2Amount" data-value-type="number" value="${formatEditableNumber(row.ks2Amount)}" /></td>
    <td class="holdback-section-cell"><input data-path="holdbacks.rows.${rowIndex}.materialsUsed" data-value-type="number" value="${formatEditableNumber(row.materialsUsed)}" /></td>
  `;
}

function renderHoldbackSectionMiddleCells(computed, subitemCount) {
  // Логика Excel для раздела удержаний:
  // D = сумма подпунктов по полученному авансу
  // E = служебное поле по подпунктам / документам
  // F = сумма подпунктов по незакрытому остатку прошлого периода
  // G = сумма подпунктов по сумме закрытия
  // H = сумма подпунктов по остатку к закрытию следующего периода
  return `
    <td class="holdback-section-cell holdback-middle-result">${formatMoney(computed.advanceReceived)}</td>
    <td class="holdback-section-cell holdback-middle-doc">${subitemCount ? `${subitemCount} подп.` : '—'}</td>
    <td class="holdback-section-cell holdback-middle-result">${formatMoney(computed.previousBalance)}</td>
    <td class="holdback-section-cell holdback-middle-result">${formatMoney(computed.closingAmount)}</td>
    <td class="holdback-section-cell holdback-middle-result">${formatMoney(computed.nextBalance)}</td>
  `;
}

function renderHoldbackSectionRightCells(rowIndex, row, computed) {
  return `
    <td class="holdback-section-cell holdback-percent-cell"><input data-path="holdbacks.rows.${rowIndex}.retentionRate" data-value-type="number" value="${formatEditableNumber(row.retentionRate)}" /></td>
    <td class="holdback-section-cell holdback-result-cell">${formatMoney(computed.retentionAmount)}</td>
    <td class="holdback-section-cell holdback-result-cell">${formatMoney(computed.payableAmount)}</td>
    <td class="holdback-section-cell holdback-comment-cell"><textarea data-path="holdbacks.rows.${rowIndex}.comment" placeholder="Комментарий по разделу">${escapeHtml(row.comment)}</textarea></td>
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

function buildHoldbacksXmlSettlementModel() {
  const groups = buildHoldbackGroups();
  const settlementRows = [];
  let totalRetention = 0;
  let totalClaims = 0;

  groups.forEach((group) => {
    const section = group.section.row;
    const computed = computeHoldbackSectionComputed(group);

    if (computed.retentionAmount > 0) {
      settlementRows.push({
        source: 'section-retention',
        sectionName: section.name || '',
        amount: computed.retentionAmount,
        kindCode: '32', // гарантийное удержание / отложенный платеж
        kindLabel: 'ВидУдерж',
        comment: section.comment || '',
      });
      totalRetention += computed.retentionAmount;
    }

    group.subitems.forEach((item) => {
      const row = item.row;
      const closingAmount = numberOrZero(row.closingAmount);
      if (closingAmount > 0) {
        settlementRows.push({
          source: 'subitem-advance-closing',
          sectionName: section.name || '',
          documentRef: row.advanceDoc || '',
          amount: closingAmount,
          kindCode: '31', // зачет аванса
          kindLabel: 'ВидУдерж',
          comment: row.comment || '',
        });
        totalRetention += closingAmount;
      }
    });
  });

  return {
    totalRetention,
    totalClaims,
    settlementRows,
  };
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

function createBlankHoldbackRow(kind = 'section') {
  return {
    kind,
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
