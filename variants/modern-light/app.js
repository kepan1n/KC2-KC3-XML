import { buildCustomerXmlReadiness } from './customer-readiness.js';

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
  exportPair: document.getElementById('export-pair'),
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

const XML_P_CONSTANT_KEYS = [
  'isGovMunicipal',
  'vatCalcInTotalOnly',
  'cumulativeMode',
  'priceIndexYear',
  'requiresSettlementApproval',
  'diadocCompactMode',
];

const XML_P_MANUAL_KEYS = [
  'economicSubjectName',
  'isCorrectionAct',
  'correctionNumber',
  'correctionDate',
  'hasEstimateChange',
  'estimateVersionCode',
  'supplementDocType',
  'supplementDocNumber',
  'supplementDocDate',
  'contractorInn',
  'customerInn',
  'developerPostalIndex',
  'developerRegionCode',
  'signerName',
  'signerPosition',
  'signerStatus',
  'signatureType',
  'customInfoValue',
  'contractorPostalIndex',
  'contractorRegionCode',
  'contractorSignaturePayload',
  'contractorSignaturePayloads',
  'contractorSignatures',
];

const XML_Z_MANUAL_KEYS = [
  'customerEconomicSubjectName',
  'customerAuthorityDocName',
  'customerAuthorityDocNumber',
  'customerAuthorityDocDate',
  'customerAuthorityDocId',
  'customerAuthorityDocInfo',
  'customerSignerAuthorityDocName',
  'customerSignerAuthorityDocNumber',
  'customerSignerAuthorityDocDate',
  'customerSignerAuthorityDocId',
  'customerSignerAuthorityDocInfo',
  'customerSignerStatus',
  'customerSignatureType',
  'customerSignatureStorageId',
  'customerAcceptanceCode',
  'customerAcceptanceText',
  'customerAcceptanceDate',
  'customerAcceptanceRefusalInfo',
  'customerAcceptanceRefusalDate',
  'customerAcceptanceRefusalDocName',
  'customerAcceptanceRefusalDocNumber',
  'customerAcceptanceRefusalDocDate',
  'customerAcceptanceRefusalDocId',
  'customerAcceptanceDefectInfo',
  'customerAcceptanceDefectDocName',
  'customerAcceptanceDefectDocNumber',
  'customerAcceptanceDefectDocDate',
  'customerAcceptanceDefectDocId',
  'customerAcceptanceNdflAmount',
  'customerReductionBaseAmount',
  'customerReductionTaxAmount',
  'customerReductionToBePaidAmount',
  'customerReductionToBePaidFromStartAmount',
  'customerReductionTotalAmount',
  'customerSettlementNotice',
  'customerSettlementDisagreementReason',
  'customerSettlementExtraDocName',
  'customerSettlementExtraDocNumber',
  'customerSettlementExtraDocDate',
  'customerSettlementExtraDocId',
  'customerSettlementIgnoredDocName',
  'customerSettlementIgnoredDocNumber',
  'customerSettlementIgnoredDocDate',
  'customerSettlementIgnoredDocId',
  'customerSignerPowerId',
  'customerSignerPowerNumber',
  'customerSignerPowerDate',
  'customerSignerPowerInternalNumber',
  'customerSignerPowerRegistrationDate',
  'customerSignerPowerSystemMark',
  'customerSignerPaperPowerDate',
  'customerSignerPaperPowerInternalNumber',
  'customerSignerPaperPowerIdentity',
  'customerSignerPaperPowerFio',
];

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
      flash(filename.endsWith('.zip') ? 'Архив XML прошёл XSD-проверку и выгружен.' : 'XML подрядчика прошёл XSD-проверку и выгружен.');
    } catch (error) {
      flash(`Не удалось выполнить XSD-проверку: ${error.message}`);
    } finally {
      refs.exportXml.disabled = false;
      refs.exportXml.textContent = 'Экспорт XML подрядчика (P)';
    }
  });

  refs.exportPair?.addEventListener('click', async () => {
    const payload = buildLogicBundle().model;
    const blockingReadiness = buildCustomerXmlReadiness(payload, 0, null, { strictMode: Boolean(app.state.ui.customerReadinessBlockingMode) });
    if (app.state.ui.customerReadinessBlockingMode && !blockingReadiness.ready) {
      app.state.ui.activePane = 'xml';
      render();
      flash(`Экспорт P + Z остановлен: strict Z readiness-check нашёл ${blockingReadiness.errors.length} критичных пункт(ов).`);
      return;
    }
    refs.exportPair.disabled = true;
    refs.exportPair.textContent = 'Сборка P + Z…';
    try {
      const response = await fetch('/api/export-xml-bundle', {
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
          } else if ((Array.isArray(data.contractorSheetErrors) && data.contractorSheetErrors.length) || (Array.isArray(data.customerSheetErrors) && data.customerSheetErrors.length)) {
            const contractorSummary = (data.contractorSheetErrors || []).slice(0, 2).map((sheet) => `P/${sheet.sheetTitle || `Лист ${sheet.sheetIndex + 1}`}: ${(sheet.errors || []).slice(0, 2).map((err) => err.message).join(' | ')}`).join(' || ');
            const customerSummary = (data.customerSheetErrors || []).slice(0, 2).map((sheet) => `Z/${sheet.sheetTitle || `Лист ${sheet.sheetIndex + 1}`}: ${(sheet.errors || []).slice(0, 2).map((err) => err.message).join(' | ')}`).join(' || ');
            errorMessage = [contractorSummary, customerSummary].filter(Boolean).join(' || ');
          } else if (data.error) {
            errorMessage = data.error;
          }
        } catch (_) {}
        flash(`Комплект P + Z не выгружен: ${errorMessage}`);
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] || `${payload.xml.generated.fileId || `ON_AKTREZRABP_${new Date().toISOString().slice(0, 10)}`}-p-z.zip`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      flash('Комплект подрядчик + заказчик (P + Z) собран и выгружен.');
    } catch (error) {
      flash(`Не удалось собрать комплект P + Z: ${error.message}`);
    } finally {
      refs.exportPair.disabled = false;
      refs.exportPair.textContent = 'Экспорт P + Z (ZIP)';
    }
  });

  refs.toggleHeaders?.addEventListener('click', () => {
    app.state.documentContext.showDocumentHeaders = !app.state.documentContext.showDocumentHeaders;
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

  if (action === 'split-legacy-forms') {
    const defaultName = app.state?.meta?.serverSaveName || `split-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
    const name = window.prompt('Базовое имя для single-sheet файлов:', defaultName);
    if (!name) return;
    fetch('/api/forms/split-single-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, state: app.state }),
    })
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok || !data.ok) throw new Error(data.error || `Ошибка ${response.status}`);
        flash(`Создано single-sheet форм: ${data.count}. Каталог: saved-forms/split-single-sheet/`);
      })
      .catch((error) => flash(`Не удалось разложить legacy-форму: ${error.message}`));
    return;
  }

  if (action === 'toggle-sheet-add-menu') {
    const idx = Number(sheetIndex);
    app.state.ui.sheetAddMenu = app.state.ui.sheetAddMenu === idx ? null : idx;
    render();
    return;
  }

  if (action === 'toggle-customer-readiness-blocking') {
    app.state.ui.customerReadinessBlockingMode = !app.state.ui.customerReadinessBlockingMode;
    render();
    flash(app.state.ui.customerReadinessBlockingMode
      ? 'Strict Z readiness-check включён: экспорт P + Z будет блокироваться на бизнес-ошибках заказчика.'
      : 'Strict Z readiness-check выключён: checklist остаётся advisory-проверкой.');
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
    if (mode === 'xml') loadKs2XmlPreviewPair(idx, true);
    return;
  }

  if (action === 'refresh-ks2-xml-preview') {
    loadKs2XmlPreview(Number(sheetIndex), true);
    return;
  }

  if (action === 'refresh-customer-xml-preview') {
    loadCustomerXmlPreview(Number(sheetIndex), true);
    return;
  }

  if (action === 'refresh-ks2-xml-preview-pair') {
    loadKs2XmlPreviewPair(Number(sheetIndex), true);
    return;
  }

  if (action === 'copy-ks2-xml-preview') {
    const idx = Number(sheetIndex);
    const preview = app.state.ui.ks2XmlPreview?.[String(idx)];
    const xmlText = prettyFormatXml(preview?.xmlText || '');
    if (!xmlText) {
      flash('Сначала собери XML подрядчика по листу.');
      return;
    }
    navigator.clipboard.writeText(xmlText)
      .then(() => flash('XML подрядчика скопирован в буфер обмена.'))
      .catch((error) => flash(`Не удалось скопировать XML: ${error.message}`));
    return;
  }

  if (action === 'copy-customer-xml-preview') {
    const idx = Number(sheetIndex);
    const preview = app.state.ui.ks2CustomerXmlPreview?.[String(idx)];
    const xmlText = prettyFormatXml(preview?.xmlText || '');
    if (!xmlText) {
      flash('Сначала собери XML заказчика по листу.');
      return;
    }
    navigator.clipboard.writeText(xmlText)
      .then(() => flash('XML заказчика скопирован в буфер обмена.'))
      .catch((error) => flash(`Не удалось скопировать XML: ${error.message}`));
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

  if (action === 'duplicate-sheet' || action === 'delete-sheet') {
    clearTransientRowUi();
    flash('Редактор работает только с одним листом КС-2 за раз.');
    return;
  }

  if (action === 'add-holdback-row') {
    const targetSheetIndex = Number(actionButton.dataset.sheetIndex);
    getOrCreateHoldbackSectionIndexForSheet(targetSheetIndex);
    render();
    return;
  }

  if (action === 'add-holdback-advance-doc') {
    const targetSheetIndex = Number(actionButton.dataset.sheetIndex);
    const sectionIndex = getOrCreateHoldbackSectionIndexForSheet(targetSheetIndex);
    if (sectionIndex < 0) return;
    let insertAt = sectionIndex + 1;
    while (insertAt < app.state.holdbacks.rows.length && (app.state.holdbacks.rows[insertAt].kind || 'section') === 'subitem') {
      insertAt += 1;
    }
    const targetSheetId = app.state.ks2Sheets[targetSheetIndex]?.id || '';
    app.state.holdbacks.rows.splice(insertAt, 0, createBlankHoldbackRow('subitem', targetSheetId));
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
    app.state.ui.holdbackActionMenu = null;
    flash('Основная строка 3% теперь одна на лист КС-2. Добавляй только документы авансов ниже.');
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
    const sheetIndex = Number(actionButton.dataset.sheetIndex);
    const targetSheetId = Number.isFinite(sheetIndex) ? (app.state.ks2Sheets[sheetIndex]?.id || '') : (app.state.ks2Sheets.length === 1 ? app.state.ks2Sheets[0].id : '');
    const hasPrimaryForSheet = (app.state.xmlExtras.settlementRows || []).some((row) => row.isPrimary && String(getExplicitSettlementSheetId(row) || '') === String(targetSheetId || ''));
    app.state.xmlExtras.settlementRows.push(createBlankSettlementRow(presetKey, { ks2SheetId: targetSheetId, isPrimary: !hasPrimaryForSheet }));
    app.state = prepareState(app.state);
    render();
    flash(`Добавлена строка XML: ${SETTLEMENT_ROW_PRESETS[presetKey]?.label || 'расчеты / удержания'}.`);
    return;
  }

  if (action === 'set-primary-settlement-row') {
    const idx = Number(actionButton.dataset.settlementIndex);
    const targetSheetId = String(getExplicitSettlementSheetId(app.state.xmlExtras.settlementRows?.[idx]) || '');
    app.state.xmlExtras.settlementRows = (app.state.xmlExtras.settlementRows || []).map((row, rowIndex) => ({
      ...row,
      isPrimary: String(getExplicitSettlementSheetId(row) || '') === targetSheetId ? rowIndex === idx : Boolean(row.isPrimary),
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
  app.state.ui.ks2CustomerXmlPreview = {};
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

function getExplicitHoldbackSheetId(row) {
  return String(row?.ks2SheetId ?? row?.linkedKs2SheetId ?? row?.sheetId ?? '').trim();
}

function getExplicitSettlementSheetId(row) {
  return String(row?.ks2SheetId ?? row?.linkedKs2SheetId ?? row?.sheetId ?? '').trim();
}

function isKnownKs2SheetId(sheetId, ks2Sheets = app.state?.ks2Sheets || []) {
  const normalizedSheetId = String(sheetId || '').trim();
  if (!normalizedSheetId) return false;
  return (ks2Sheets || []).some((sheet) => String(sheet.id || '').trim() === normalizedSheetId);
}

function guessKs2SheetIdForHoldbackRow(row, ks2Sheets) {
  if (!row || (row.kind || row.type || 'section') === 'subitem') return getExplicitHoldbackSheetId(row);
  const explicitSheetId = getExplicitHoldbackSheetId(row);
  if (explicitSheetId) return explicitSheetId;
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

function migrateLegacyHoldbackSheetBindings(rows, ks2Sheets) {
  if (ks2Sheets.length === 1) {
    const singleSheetId = ks2Sheets[0].id;
    return (rows || []).map((row) => ({
      ...row,
      kind: row.kind || row.type || 'section',
      ks2SheetId: singleSheetId,
    }));
  }

  let currentSectionSheetId = '';
  return (rows || []).map((row) => {
    const kind = row.kind || row.type || 'section';
    const explicitSheetId = getExplicitHoldbackSheetId(row);
    let ks2SheetId = explicitSheetId;

    if (kind === 'subitem') {
      ks2SheetId = explicitSheetId || currentSectionSheetId || '';
    } else {
      ks2SheetId = explicitSheetId || guessKs2SheetIdForHoldbackRow(row, ks2Sheets);
      currentSectionSheetId = ks2SheetId;
    }

    return {
      ...row,
      kind,
      ks2SheetId,
    };
  });
}

function migrateLegacySettlementSheetBindings(rows, ks2Sheets) {
  if (ks2Sheets.length === 1) {
    const singleSheetId = ks2Sheets[0].id;
    return (rows || []).map((row) => ({
      ...row,
      ks2SheetId: singleSheetId,
    }));
  }
  return (rows || []).map((row) => ({
    ...row,
    ks2SheetId: getExplicitSettlementSheetId(row) || '',
  }));
}

function ensureSettlementPrimaryRows(rows, ks2Sheets) {
  const groups = new Map();
  (rows || []).forEach((row, index) => {
    const key = getExplicitSettlementSheetId(row) || (ks2Sheets.length === 1 ? ks2Sheets[0].id : '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ row, index });
  });

  const nextRows = (rows || []).map((row) => ({ ...row, isPrimary: false }));
  groups.forEach((entries) => {
    const preferred = entries.find(({ row }) => row.isPrimary) || entries[0];
    if (preferred) nextRows[preferred.index].isPrimary = true;
  });
  return nextRows;
}

function buildUniqueKs2SheetId(rawId, index, usedIds) {
  const baseId = String(rawId || '').trim() || `ks2-${index + 1}`;
  let candidate = baseId;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function enforceSingleKs2SheetMode(data) {
  data.legacy ??= {};
  const sheets = Array.isArray(data.ks2Sheets) ? data.ks2Sheets : [];
  if (!sheets.length) {
    data.ks2Sheets = [createBlankSheet(1)];
    data.legacy.extraKs2Sheets = [];
  } else if (sheets.length > 1) {
    const [firstSheet, ...restSheets] = sheets;
    data.ks2Sheets = [firstSheet];
    data.legacy.extraKs2Sheets = restSheets;
  } else {
    data.ks2Sheets = sheets;
    data.legacy.extraKs2Sheets = Array.isArray(data.legacy.extraKs2Sheets) ? data.legacy.extraKs2Sheets : [];
  }

  const droppedCount = (data.legacy.extraKs2Sheets || []).length;
  data.ui.singleSheetModeNotice = droppedCount
    ? `Редактор работает только с одним листом КС-2. Текущий лист оставлен активным, а ещё ${droppedCount} лист(ов) сохранены как legacy-данные и не участвуют в текущем экспорте.`
    : 'Редактор работает только с одним листом КС-2 за раз.';
}

function migrateLegacyDocumentContext(data) {
  data.documentContext = {
    ...(data.common || {}),
    ...(data.documentContext || {}),
  };
  data.common = data.documentContext;
}

function mergeXmlManualScopes(xmlPManual = {}, xmlZManual = {}) {
  return {
    ...clone(xmlPManual || {}),
    ...clone(xmlZManual || {}),
  };
}

function scopeXmlManual(manual = {}, scope = 'p') {
  const keys = new Set(scope === 'z' ? XML_Z_MANUAL_KEYS : XML_P_MANUAL_KEYS);
  return Object.fromEntries(Object.entries(manual || {}).filter(([key]) => keys.has(key) || (scope === 'p' && !XML_Z_MANUAL_KEYS.includes(key))));
}

function migrateLegacyXmlScopes(data) {
  data.xmlP ??= {};
  data.xmlZ ??= {};
  data.xmlExtras ??= {};

  data.xmlP.generated = {
    ...(data.xmlExtras.generated || {}),
    ...(data.xmlP.generated || {}),
  };
  data.xmlP.constants = {
    ...(data.xmlExtras.constants || {}),
    ...(data.xmlP.constants || {}),
  };

  const legacyManual = data.xmlExtras.manual || {};
  data.xmlP.manual = {
    ...scopeXmlManual(legacyManual, 'p'),
    ...(data.xmlP.manual || {}),
  };
  data.xmlZ.manual = {
    ...scopeXmlManual(legacyManual, 'z'),
    ...(data.xmlZ.manual || {}),
  };

  data.xmlExtras.generated = data.xmlP.generated;
  data.xmlExtras.constants = data.xmlP.constants;
  data.xmlExtras.manual = mergeXmlManualScopes(data.xmlP.manual, data.xmlZ.manual);
}

function normalizeActivePaneSingleSheet(value) {
  const pane = String(value ?? '').trim();
  if (!pane) return 'requisites';
  if (pane === 'ks3' || pane === 'holdbacks') return 'requisites';
  if (pane === 'ks2' || pane === 'sheet' || pane === 'current-sheet') return 'ks2:0';
  if (pane.startsWith('ks2:')) return 'ks2:0';
  if (pane === 'requisites' || pane === 'xml') return pane;
  return 'requisites';
}

function prepareState(raw) {
  const data = clone(raw);
  data.ui ??= {};
  data.ui.activePane = normalizeActivePaneSingleSheet(data.ui.activePane);
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
  data.ui.ks2CustomerXmlPreview ??= {};
  data.ui.columnWidths ??= {};
  data.ui.customerReadinessBlockingMode ??= false;
  data.common ??= {};
  data.documentContext ??= {};
  migrateLegacyDocumentContext(data);
  data.ks3 ??= {};
  data.holdbacks ??= { rows: [] };
  data.legacy ??= {};
  enforceSingleKs2SheetMode(data);
  data.ui.activePane = normalizeActivePaneSingleSheet(data.ui.activePane);
  data.holdbacks.rows ??= [];
  data.xmlExtras ??= {};
  data.xmlExtras.generated ??= {};
  data.xmlExtras.constants ??= {};
  data.xmlExtras.manual ??= {};
  data.xmlExtras.traceableGoods ??= [];
  data.xmlExtras.settlementRows ??= [];
  data.xmlP ??= {};
  data.xmlZ ??= {};
  migrateLegacyXmlScopes(data);
  data.xmlExtras.traceableGoods ??= [];
  data.xmlExtras.settlementRows = (data.xmlExtras.settlementRows || []).map((row) => prepareSettlementRow(row));
  data.xmlP.constants.isGovMunicipal ||= '0';
  data.xmlP.constants.vatCalcInTotalOnly ||= '0';
  data.xmlP.constants.cumulativeMode ||= '1';
  data.xmlP.constants.priceIndexYear ||= '0000';
  data.xmlP.constants.requiresSettlementApproval ||= '0';
  data.xmlP.constants.diadocCompactMode ||= '0';
  data.xmlP.manual.isCorrectionAct ||= '0';
  data.xmlP.manual.hasEstimateChange ||= '1';
  data.xmlExtras.constants = data.xmlP.constants;
  data.xmlExtras.generated = data.xmlP.generated;
  data.xmlExtras.manual = mergeXmlManualScopes(data.xmlP.manual, data.xmlZ.manual);

  data.common.okudKs3 = data.common.okudKs3 && data.common.okudKs3 !== 'Форма по ОКУД' ? data.common.okudKs3 : '0322001';
  data.common.showDocumentHeaders = data.common.showDocumentHeaders ?? false;
  data.common.showDocumentSignatures = data.common.showDocumentSignatures ?? false;
  data.common.contractorSignLabel ||= 'Сдал';
  data.common.contractorSignerPosition ||= 'Генеральный директор ООО «ЛегендаЭлит»';
  data.common.contractorSignerName ||= 'А. Дылюк';
  data.common.customerSignLabel ||= 'Принял';
  data.common.customerSignerPosition ||= 'ООО «СЗ «АСПЕЙС Хорошевская» в лице Генерального директора управляющей организации ООО «АСПЕЙС Девелопмент»';
  data.common.customerSignerName ||= 'О.В. Смирнов';
  data.common.techCustomerSignerPosition ||= '';
  data.common.techCustomerSignerName ||= '';
  data.common.objectOkpo ||= '';
  data.common.okdpCode ||= '';
  data.common.ks2DocLabel ||= 'АКТ';
  data.common.ks2DocSubtitle ||= 'О ПРИЕМКЕ ВЫПОЛНЕННЫХ РАБОТ';
  data.common.ks3DocLabel ||= 'СПРАВКА';
  data.common.ks3DocSubtitle ||= 'О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ И ЗАТРАТ';
  data.common.customerSignerPosition ||= '';
  data.common.customerSignerName ||= '';
  data.common.ks3ContractorPosition ||= data.common.contractorSignerPosition || 'Генеральный директор ООО «ЛегендаЭлит»';
  data.common.ks3ContractorName ||= data.common.contractorSignerName || 'А. Дылюк';

  const usedKs2SheetIds = new Set();
  data.ks2Sheets = (data.ks2Sheets || []).map((sheet, index) => {
    const prepared = {
      ...sheet,
      id: buildUniqueKs2SheetId(sheet.id, index, usedKs2SheetIds),
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

  data.ks3.documentNumber ||= data.ks2Sheets[0]?.documentNumber || '1';
  data.ks3.documentDate ||= data.ks2Sheets[0]?.documentDate || new Date().toISOString().slice(0, 10);
  data.ks3.periodFrom ||= data.ks2Sheets[0]?.periodFrom || new Date().toISOString().slice(0, 10);
  data.ks3.periodTo ||= data.ks2Sheets[0]?.periodTo || new Date().toISOString().slice(0, 10);
  const legacyKs3Totals = data.ks3.totals || {};
  data.ks3.rows = [];
  data.ks3.totals = {
    fromStart: numberOrNull(legacyKs3Totals.fromStart),
    fromYearStart: numberOrNull(legacyKs3Totals.fromYearStart ?? legacyKs3Totals.subtotal),
    forPeriod: numberOrNull(legacyKs3Totals.forPeriod ?? legacyKs3Totals.subtotal),
    vat: numberOrNull(legacyKs3Totals.vat),
  };

  data.xmlExtras.settlementRows = ensureSettlementPrimaryRows(
    migrateLegacySettlementSheetBindings(data.xmlExtras.settlementRows || [], data.ks2Sheets).map((row) => prepareSettlementRow(row)),
    data.ks2Sheets,
  );

  data.holdbacks.rows = migrateLegacyHoldbackSheetBindings(data.holdbacks.rows || [], data.ks2Sheets).map((row) => {
    const kind = row.kind || row.type || 'section';
    const ks2Amount = numberOrZero(row.ks2Amount);
    const retentionAmount = numberOrZero(row.retentionAmount);
    const retentionRate = row.retentionRate ?? (ks2Amount ? round2((retentionAmount / ks2Amount) * 100) : 3);
    const explicitSheetId = getExplicitHoldbackSheetId(row);
    return {
      ...row,
      kind,
      name: row.name ?? '',
      advanceDoc: row.advanceDoc ?? '',
      advanceDocName: row.advanceDocName ?? '',
      advanceDocNumber: row.advanceDocNumber ?? '',
      advanceDocDate: row.advanceDocDate ?? '',
      advanceDocExtra: row.advanceDocExtra ?? '',
      comment: row.comment ?? '',
      ks2SheetId: explicitSheetId || (data.ks2Sheets.length === 1 ? data.ks2Sheets[0].id : ''),
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
  data.holdbacks.rows = normalizeHoldbackRowsPerSheet(data.holdbacks.rows, data.ks2Sheets);

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
    refs.toggleHeaders.textContent = app.state.documentContext.showDocumentHeaders ? 'Шапки: вкл' : 'Шапки: выкл';
    refs.toggleHeaders.classList.toggle('is-active', Boolean(app.state.documentContext.showDocumentHeaders));
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

  const sheet = app.state.ks2Sheets[0] || createBlankSheet(1);
  const docNo = sheet.documentNumber || 1;
  const title = sheet.title || 'Лист КС-2';
  const ks2Button = `
    <button class="nav-chip ${active === 'ks2:0' ? 'active' : ''}" data-pane="ks2:0" title="${escapeAttr(`${title} · №${docNo}`)}">КС-2</button>
  `;

  refs.navStrip.innerHTML = `
    <div class="nav-strip-group">
      ${primaryButtons}
    </div>
    <div class="nav-strip-divider"></div>
    <div class="nav-strip-group nav-strip-group-scroll">
      ${ks2Button}
    </div>
  `;
}

function renderStats() {
  const totalRows = app.state.ks2Sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
  const grossTotal = app.state.ks2Sheets.reduce((sum, sheet) => sum + computeSheetTotals(sheet).gross, 0);
  const validation = buildLogicBundle().validation;
  const ignoredSheets = app.state.legacy?.extraKs2Sheets?.length || 0;
  refs.stats.textContent = `1 лист КС-2 · ${totalRows} строк · общая сумма с НДС: ${formatMoney(grossTotal)} · ошибок: ${validation.errors.length} · предупреждений: ${validation.warnings.length}${ignoredSheets ? ` · доп. legacy-листов вне текущей формы: ${ignoredSheets}` : ''}`;
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
    documentContext: clone(app.state.documentContext),
    common: clone(app.state.documentContext),
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
    legacy: {
      extraKs2Sheets: clone(app.state.legacy?.extraKs2Sheets || []),
    },
    xmlP: {
      generated: buildGeneratedXmlFields(),
      constants: clone(app.state.xmlP.constants),
      manual: clone(app.state.xmlP.manual),
      traceableGoods: clone(app.state.xmlExtras.traceableGoods),
    },
    xmlZ: {
      manual: clone(app.state.xmlZ.manual),
    },
    xml: {
      generated: buildGeneratedXmlFields(),
      constants: clone(app.state.xmlP.constants),
      manual: mergeXmlManualScopes(app.state.xmlP.manual, app.state.xmlZ.manual),
      traceableGoods: clone(app.state.xmlExtras.traceableGoods),
      settlement: holdbacksXml,
    },
  };
}

function firstFilledValue(...values) {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === 'string') {
      if (!value.trim()) continue;
      return value.trim();
    }
    return value;
  }
  return '';
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

  requireValue(((model.documentContext || model.common)).developerName, 'documentContext.developerName', 'Застройщик');
  requireValue(((model.documentContext || model.common)).developerOkpo, 'documentContext.developerOkpo', 'ОКПО застройщика');
  requireValue(((model.documentContext || model.common)).techCustomerName, 'documentContext.techCustomerName', 'Технический заказчик');
  requireValue(((model.documentContext || model.common)).techCustomerOkpo, 'documentContext.techCustomerOkpo', 'ОКПО технического заказчика');
  requireValue(((model.documentContext || model.common)).contractorName, 'documentContext.contractorName', 'Генподрядчик');
  requireValue(((model.documentContext || model.common)).contractorOkpo, 'documentContext.contractorOkpo', 'ОКПО генподрядчика');
  requireValue(((model.documentContext || model.common)).constructionObject, 'documentContext.constructionObject', 'Стройка');
  requireValue(((model.documentContext || model.common)).objectName, 'documentContext.objectName', 'Объект');
  requireValue(((model.documentContext || model.common)).contractNumber, 'documentContext.contractNumber', 'Номер договора');
  requireValue(((model.documentContext || model.common)).contractDate, 'documentContext.contractDate', 'Дата договора');
  requireValue(((model.documentContext || model.common)).operationType, 'documentContext.operationType', 'Вид операции');
  requireValue(((model.documentContext || model.common)).okudKs2, 'documentContext.okudKs2', 'ОКУД КС-2');
  requireValue(((model.documentContext || model.common)).objectOkpo, 'documentContext.objectOkpo', 'ОКПО объекта', 'warning');
  requireValue(((model.documentContext || model.common)).okdpCode, 'documentContext.okdpCode', 'ОКДП', 'warning');

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

  if ((model.legacy?.extraKs2Sheets || []).length) {
    pushIssue('warning', 'legacy.extraKs2Sheets', 'Single-sheet режим', `Во входных данных были дополнительные листы КС-2 (${model.legacy.extraKs2Sheets.length} шт.). Редактор и экспорт используют только текущий лист; остальные можно разложить в отдельные single-sheet формы.`);
  }

  if (!model.holdbacks.rows.length) {
    pushIssue('warning', 'holdbacks.rows', 'Удержания', 'Нет ни одной строки удержаний');
  }

  if (model.ks2Sheets.length > 1) {
    model.holdbacks.sections.forEach((section, index) => {
      const sheetId = String(section.ks2SheetId || '').trim();
      if (!sheetId) {
        pushIssue('error', `holdbacks.sections.${index}.ks2SheetId`, `Удержания: раздел ${index + 1}`, 'Во входных legacy-данных у каждой строки удержаний должна быть явная привязка к листу КС-2. Без неё текущий single-sheet export не собирается.');
        return;
      }
      if (!isKnownKs2SheetId(sheetId, model.ks2Sheets)) {
        pushIssue('error', `holdbacks.sections.${index}.ks2SheetId`, `Удержания: раздел ${index + 1}`, `Указанный лист КС-2 (${sheetId}) не найден среди текущих листов. Выбери актуальную привязку.`);
      }
    });
  }

  requireValue(model.xmlP.manual.contractorInn, 'xmlP.manual.contractorInn', 'ИНН подрядчика', 'warning');
  requireValue(model.xmlP.manual.customerInn, 'xmlP.manual.customerInn', 'ИНН заказчика', 'warning');
  requireValue(model.xmlP.manual.economicSubjectName || ((model.documentContext || model.common)).contractorName, 'xmlP.manual.economicSubjectName', 'Составитель XML', 'warning');
  if (String(model.xmlP.manual.isCorrectionAct || '0') === '1') {
    requireValue(model.xmlP.manual.correctionNumber, 'xmlP.manual.correctionNumber', 'Исправление №', 'warning');
    requireValue(model.xmlP.manual.correctionDate, 'xmlP.manual.correctionDate', 'Дата исправления', 'warning');
  }

  if (String(model.xmlP.manual.hasEstimateChange || '1') === '1') {
    requireValue(model.xmlP.manual.estimateVersionCode, 'xmlP.manual.estimateVersionCode', 'Версия сметы (КодСмет)', 'warning');
    requireValue(model.xmlP.manual.supplementDocType, 'xmlP.manual.supplementDocType', 'Тип допсоглашения', 'warning');
    requireValue(model.xmlP.manual.supplementDocNumber, 'xmlP.manual.supplementDocNumber', 'Номер допсоглашения', 'warning');
    requireValue(model.xmlP.manual.supplementDocDate, 'xmlP.manual.supplementDocDate', 'Дата допсоглашения', 'warning');
  }
  requireValue(model.xmlP.manual.developerPostalIndex, 'xmlP.manual.developerPostalIndex', 'Индекс адреса', 'warning');
  requireValue(model.xmlP.manual.developerRegionCode, 'xmlP.manual.developerRegionCode', 'Код региона', 'warning');
  requireValue(model.xmlP.manual.signerName || ((model.documentContext || model.common)).contractorSignerName, 'xmlP.manual.signerName', 'Подписант XML: ФИО', 'warning');

  const manualSettlementRows = model.xml.settlement?.manualRows || [];
  manualSettlementRows.forEach((row, index) => {
    const hasContent = numberOrZero(row.amount) > 0 || row.documentRef || row.comment || row.customKindText;
    if (!hasContent) return;
    if (model.ks2Sheets.length > 1) {
      const sheetId = String(row.ks2SheetId || '').trim();
      if (!sheetId) {
        pushIssue('error', `xml.settlement.manualRows.${index}.ks2SheetId`, `СвОРасч: строка ${index + 1}`, 'Во входных legacy-данных ручную строку ВидТреб / ВидУдерж нужно явно привязать к листу КС-2. Без этого single-sheet export не собирается.');
      } else if (!isKnownKs2SheetId(sheetId, model.ks2Sheets)) {
        pushIssue('error', `xml.settlement.manualRows.${index}.ks2SheetId`, `СвОРасч: строка ${index + 1}`, `Указанный лист КС-2 (${sheetId}) не найден среди текущих листов.`);
      }
    }
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

  const customerReadiness = buildCustomerXmlReadiness(model, 0, null, { includeSheetSpecific: false });
  customerReadiness.issues.forEach((issue) => {
    pushIssue(issue.severity, issue.path, `Файл Z: ${issue.label}`, issue.message);
  });

  return {
    errors,
    warnings,
    readyForExport: errors.length === 0,
  };
}

function renderValidationIssue(issue) {
  return `<li class="issue-item ${issue.severity}"><strong>${escapeHtml(issue.label)}:</strong> ${escapeHtml(issue.message)}</li>`;
}

function renderReadinessCheck(check) {
  const renderedValue = String(check.value || '—').trim() || '—';
  const modeSuffix = check.blockingCandidate && check.status !== 'error'
    ? ' — в strict mode этот пункт станет блокирующим'
    : check.baseStatus === 'warning' && check.status === 'error'
      ? ' — escalated to blocking by strict mode'
      : '';
  const suffix = `${check.message ? ` — ${escapeHtml(check.message)}` : ''}${escapeHtml(modeSuffix)}`;
  return `<li class="issue-item ${check.status}"><strong>${escapeHtml(check.label)}:</strong> ${escapeHtml(renderedValue)}${suffix}</li>`;
}

function summarizeCustomerReadiness(readiness, options = {}) {
  const { blockingMode = false, advisoryEscalationCount = 0 } = options;
  if (!readiness) return 'Чеклист готовности Z пока не собран.';
  if (readiness.errors.length) {
    return blockingMode
      ? `Strict Z readiness-check блокирует экспорт: ${readiness.errors.length} критич. пункт(ов) и ${readiness.warnings.length} предупрежд.`
      : `Z пока не готов: ${readiness.errors.length} критич. пункт(ов) и ${readiness.warnings.length} предупрежд. Проверь обязательные реквизиты и бизнес-правила заказчика.`;
  }
  if (readiness.warnings.length) {
    return blockingMode
      ? `Strict Z readiness-check сейчас зелёный по критичным ошибкам, но оставляет ${readiness.warnings.length} неблокирующих предупреждени(й).`
      : `Z собирается, но с оговорками: ${readiness.warnings.length} пункт(ов) сейчас опираются на fallback или выглядят неполными.${advisoryEscalationCount ? ` Если включить blocking mode, ещё ${advisoryEscalationCount} из них станут блокирующими.` : ''}`;
  }
  return blockingMode
    ? 'Strict Z readiness-check зелёный: экспорт P + Z не должен стопориться по customer-бизнес-правилам.'
    : 'Z выглядит готовым: критичных проблем и fallback-предупреждений не найдено.';
}

function renderCustomerReadinessPanel(readiness, options = {}) {
  if (!readiness) return '';
  const {
    title = 'Z readiness-check',
    subtitle = 'Показываем, где customer XML уже готов, а где генератор пока живёт на fallback-значениях.',
    blockingMode = false,
    advisoryEscalationCount = 0,
  } = options;
  const summaryClass = readiness.errors.length || readiness.warnings.length ? 'inline-hint inline-hint-warning' : 'inline-hint';

  return `
    <div class="section-block">
      <h3>${escapeHtml(title)}</h3>
      <p class="kbd-note">${escapeHtml(subtitle)}</p>
      <div class="${summaryClass}">${escapeHtml(summarizeCustomerReadiness(readiness, { blockingMode, advisoryEscalationCount }))}</div>
      <ul class="issue-list">
        ${readiness.checks.map((check) => renderReadinessCheck(check)).join('')}
      </ul>
    </div>
  `;
}

function renderValidationSummary(validation) {
  const issues = [...(validation?.errors || []), ...(validation?.warnings || [])];
  if (!issues.length) {
    return `
      <div class="section-block">
        <h3>Логика single-sheet export</h3>
        <div class="logic-ok">Общая валидация active single-sheet формы сейчас зелёная.</div>
      </div>
    `;
  }

  return `
    <div class="section-block">
      <h3>Логика single-sheet export</h3>
      <div class="inline-hint inline-hint-warning">Сводная проверка active single-sheet формы нашла ${validation.errors.length} ошибк(и) и ${validation.warnings.length} предупреждени(я). Это отдельный слой над XSD: он ловит продуктовые и миграционные риски до выгрузки.</div>
      <ul class="issue-list">
        ${issues.slice(0, 12).map((issue) => renderValidationIssue(issue)).join('')}
        ${issues.length > 12 ? `<li class="issue-item warning">Показаны первые 12 пунктов из ${issues.length}.</li>` : ''}
      </ul>
    </div>
  `;
}

function renderXmlPreviewErrorList(preview) {
  if (!Array.isArray(preview?.errors) || !preview.errors.length) return '';
  return `
    <div class="xml-preview-errors">
      ${preview.errors.slice(0, 5).map((error) => `<div>${escapeHtml(`строка ${error.line}: ${error.message}`)}</div>`).join('')}
      ${preview.errors.length > 5 ? `<div>${escapeHtml(`… и ещё ${preview.errors.length - 5} ошибк(и)`)}.</div>` : ''}
    </div>
  `;
}

function renderRequisitesPane() {
  const c = app.state.documentContext;
  const sheet = app.state.ks2Sheets[0] || createBlankSheet(1);
  const sheetTotals = computeSheetTotals(sheet);
  const totalGross = sheetTotals.gross;
  const totalVat = sheetTotals.vat;
  const totalBase = Math.max(totalGross - totalVat, 0);

  return `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">Реквизиты single-sheet формы</h2>
          <p class="panel-subtitle">Опираемся на новый эталонный workbook <code>new example 1 sheet.xlsx</code>: один акт КС-2, один блок удержаний, без отдельного UX для КС-3.</p>
        </div>
      </div>

      <div class="summary-grid">
        <div class="summary-card"><span>Сумма с НДС по КС-2</span><strong>${formatMoney(totalGross)}</strong></div>
        <div class="summary-card"><span>Суммарный НДС</span><strong>${formatMoney(totalVat)}</strong></div>
        <div class="summary-card"><span>Сумма без НДС</span><strong>${formatMoney(totalBase)}</strong></div>
        <div class="summary-card"><span>Режим формы</span><strong>1 лист КС-2</strong></div>
      </div>

      <div class="inline-hint">${escapeHtml(app.state.ui.singleSheetModeNotice || 'Редактор работает только с одним листом КС-2 за раз.')}</div>
      <div class="inline-hint">Основной сценарий теперь такой: реквизиты документа → текущий лист КС-2 → удержания этого листа → XML P/Z. Всё, что относится к старой multi-sheet книге, вынесено в совместимость.</div>
      ${(app.state.legacy?.extraKs2Sheets || []).length ? `
        <div class="inline-actions section-block">
          <button class="secondary" data-action="split-legacy-forms">Разложить legacy-листы в отдельные single-sheet JSON</button>
          <span class="kbd-note">Будут созданы отдельные формы по каждому листу КС-2 в <code>saved-forms/split-single-sheet/</code>.</span>
        </div>
      ` : ''}

      <div class="section-block">
        <h3>Стороны и объект</h3>
        <div class="form-grid">
          ${renderInput('Заказчик / застройщик', 'documentContext.developerName', c.developerName, 'string', 'half')}
          ${renderInput('Технический заказчик', 'documentContext.techCustomerName', c.techCustomerName, 'string', 'half')}
          ${renderInput('Подрядчик', 'documentContext.contractorName', c.contractorName, 'string', 'half')}
          ${renderInput('Наименование объекта', 'documentContext.objectName', c.objectName, 'string', 'half')}
          ${renderTextarea('Стройка / адрес / описание объекта', 'documentContext.constructionObject', c.constructionObject, 'half')}
          ${renderInput('ОКПО объекта', 'documentContext.objectOkpo', c.objectOkpo, 'string', 'quarter')}
          ${renderInput('Краткое название подрядчика', 'documentContext.contractorShortName', c.contractorShortName, 'string', 'quarter')}
        </div>
      </div>

      <div class="section-block">
        <h3>Документ и договор</h3>
        <div class="form-grid">
          ${renderInput('ОКУД КС-2', 'documentContext.okudKs2', c.okudKs2, 'string', 'quarter')}
          ${renderInput('ОКДП', 'documentContext.okdpCode', c.okdpCode, 'string', 'quarter')}
          ${renderInput('Валюта (код)', 'documentContext.currencyCode', c.currencyCode, 'string', 'quarter')}
          ${renderInput('Валюта (наименование)', 'documentContext.currencyName', c.currencyName, 'string', 'quarter')}
          ${renderInput('Номер договора', 'documentContext.contractNumber', c.contractNumber, 'string', 'half')}
          ${renderInput('Дата договора', 'documentContext.contractDate', c.contractDate, 'string', 'half')}
          ${renderInput('Вид операции', 'documentContext.operationType', c.operationType, 'string', 'half')}
          ${renderInput('Заголовок документа', 'documentContext.ks2DocLabel', c.ks2DocLabel, 'string', 'quarter')}
          ${renderInput('Подзаголовок документа', 'documentContext.ks2DocSubtitle', c.ks2DocSubtitle, 'string', 'half')}
        </div>
      </div>

      <div class="section-block">
        <h3>Подписи и печатные роли</h3>
        <p class="kbd-note">Оставлены только роли, которые реально помогают собрать текущий single-sheet КС-2 и XML. КС-3-специфичные роли из активного сценария убраны.</p>
        <div class="form-grid">
          ${renderInput('Подрядчик: заголовок подписи', 'documentContext.contractorSignLabel', c.contractorSignLabel, 'string', 'quarter')}
          ${renderTextarea('Подрядчик: должность', 'documentContext.contractorSignerPosition', c.contractorSignerPosition, 'half')}
          ${renderInput('Подрядчик: ФИО', 'documentContext.contractorSignerName', c.contractorSignerName, 'string', 'quarter')}

          ${renderInput('Заказчик: заголовок подписи', 'documentContext.customerSignLabel', c.customerSignLabel, 'string', 'quarter')}
          ${renderTextarea('Заказчик: должность', 'documentContext.customerSignerPosition', c.customerSignerPosition, 'half')}
          ${renderInput('Заказчик: ФИО', 'documentContext.customerSignerName', c.customerSignerName, 'string', 'quarter')}

          ${renderInput('Проверил: заголовок', 'documentContext.ks2CheckedLabel', c.ks2CheckedLabel, 'string', 'quarter')}
          ${renderTextarea('Проверил: должность', 'documentContext.ks2CheckedPosition', c.ks2CheckedPosition, 'half')}
          ${renderInput('Проверил: ФИО', 'documentContext.ks2CheckedName', c.ks2CheckedName, 'string', 'quarter')}

          ${renderTextarea('Технический заказчик: должность', 'documentContext.techCustomerSignerPosition', c.techCustomerSignerPosition, 'half')}
          ${renderInput('Технический заказчик: ФИО', 'documentContext.techCustomerSignerName', c.techCustomerSignerName, 'string', 'quarter')}
        </div>
      </div>

      <details class="section-block advanced-requisites">
        <summary>Поля совместимости / редко нужны</summary>
        <div class="form-grid" style="margin-top: 14px;">
          ${renderInput('ОКПО застройщика', 'documentContext.developerOkpo', c.developerOkpo, 'string', 'quarter')}
          ${renderInput('ОКПО техзаказчика', 'documentContext.techCustomerOkpo', c.techCustomerOkpo, 'string', 'quarter')}
          ${renderInput('ОКПО подрядчика', 'documentContext.contractorOkpo', c.contractorOkpo, 'string', 'quarter')}
          ${renderInput('Печатный блок «Принял»: должность', 'documentContext.ks2AcceptedPosition', c.ks2AcceptedPosition, 'string', 'half')}
          ${renderInput('Печатный блок «Принял»: ФИО', 'documentContext.ks2AcceptedName', c.ks2AcceptedName, 'string', 'quarter')}
        </div>
      </details>
    </div>
  `;
}

function renderXmlPane() {
  const logicBundle = buildLogicBundle();
  const validation = logicBundle.validation;
  const customerPreview = app.state.ui.ks2CustomerXmlPreview?.['0'] || null;
  const customerReadiness = buildCustomerXmlReadiness(logicBundle.model, 0, customerPreview);
  const strictCustomerReadiness = buildCustomerXmlReadiness(logicBundle.model, 0, customerPreview, { strictMode: true });
  const blockingMode = Boolean(app.state.ui.customerReadinessBlockingMode);
  const activeCustomerReadiness = blockingMode ? strictCustomerReadiness : customerReadiness;
  const advisoryEscalationCount = Math.max((strictCustomerReadiness.summary?.errors || 0) - (customerReadiness.summary?.errors || 0), 0);
  const generated = buildGeneratedXmlFields();
  const constants = app.state.xmlP.constants;
  const contractorManual = app.state.xmlP.manual;
  const customerManual = app.state.xmlZ.manual;
  const customerSignerStatus = String(customerManual.customerSignerStatus || contractorManual.signerStatus || '1');
  const customerAcceptanceCode = String(customerManual.customerAcceptanceCode || '1');

  return `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">XML-модель: P и Z</h2>
          <p class="panel-subtitle">Внутренняя модель уже разделена на подрядческий слой <code>xmlP</code> и customer-слой <code>xmlZ</code>. На экспорт пока дополнительно собирается совместимый legacy payload.</p>
        </div>
      </div>

      <div class="summary-grid">
        <div class="summary-card"><span>Ошибки логики</span><strong>${validation.errors.length}</strong></div>
        <div class="summary-card"><span>Предупреждения логики</span><strong>${validation.warnings.length}</strong></div>
        <div class="summary-card"><span>Z readiness</span><strong>${activeCustomerReadiness.ready ? (activeCustomerReadiness.warnings.length ? 'готов с оговорками' : 'готов') : 'не готов'}</strong></div>
        <div class="summary-card"><span>Blocking mode</span><strong>${blockingMode ? 'вкл' : 'выкл'}</strong></div>
      </div>

      <div class="inline-actions section-block">
        <button class="ghost mini toggle-chip ${blockingMode ? 'is-active' : ''}" data-action="toggle-customer-readiness-blocking">${blockingMode ? 'Blocking mode Z: вкл' : 'Blocking mode Z: выкл'}</button>
        <span class="kbd-note">${blockingMode
          ? 'Экспорт P + Z сейчас реально блокируется, если strict Z readiness-check видит критичные customer-бизнес-ошибки.'
          : advisoryEscalationCount
            ? `Сейчас checklist advisory-only. Если включить blocking mode, ещё ${advisoryEscalationCount} пункт(ов) станут блокирующими для экспорта P + Z.`
            : 'Сейчас checklist advisory-only. Blocking mode можно включить, если захочешь жёстко стопорить экспорт P + Z по Z-бизнес-правилам.'}</span>
      </div>

      ${renderValidationSummary(validation)}
      ${renderCustomerReadinessPanel(activeCustomerReadiness, {
        blockingMode,
        advisoryEscalationCount,
      })}

      <div class="section-block">
        <h3>xmlP: автогенерируемые поля</h3>
        <div class="form-grid">
          ${renderReadonly('Идентификатор файла', generated.fileId, 'half', 'xmlP.generated.fileId')}
          ${renderReadonly('Дата формирования', generated.fileDate, 'quarter', 'xmlP.generated.fileDate')}
          ${renderReadonly('Время формирования', generated.fileTime, 'quarter', 'xmlP.generated.fileTime')}
          ${renderReadonly('КНД', generated.knd, 'quarter', 'xmlP.generated.knd')}
          ${renderReadonly('Версия формата', generated.formatVersion, 'quarter', 'xmlP.generated.formatVersion')}
          ${renderReadonly('Версия программы', generated.programVersion, 'quarter', 'xmlP.generated.programVersion')}
        </div>
      </div>

      <div class="section-block">
        <h3>xmlP: постоянные настройки подрядческого файла</h3>
        <div class="form-grid">
          ${renderSelect('Строительство для гос/мун нужд', 'xmlP.constants.isGovMunicipal', constants.isGovMunicipal, { '0': '0 — нет', '1': '1 — да' }, 'quarter')}
          ${renderSelect('Режим НДС', 'xmlP.constants.vatCalcInTotalOnly', constants.vatCalcInTotalOnly, { '0': '0 — НДС по строкам/разделам (основной)', '1': '1 — НДС только в итоге' }, 'half')}
          ${renderSelect('Признак накопительного итога', 'xmlP.constants.cumulativeMode', constants.cumulativeMode, { '0': '0 — без накопления', '1': '1 — в акте всё', '2': '2 — только строка «Всего»' }, 'half')}
          ${renderInput('Год индекса цен', 'xmlP.constants.priceIndexYear', constants.priceIndexYear, 'string', 'quarter')}
          ${renderSelect('Сведения о расчётах для согласования', 'xmlP.constants.requiresSettlementApproval', constants.requiresSettlementApproval, { '0': '0 — нет', '1': '1 — да' }, 'quarter')}
          ${renderSelect('Режим табличной части XML', 'xmlP.constants.diadocCompactMode', constants.diadocCompactMode || '0', { '1': 'compact / pass-friendly', '0': 'full / как в форме' }, 'half')}
        </div>
      </div>

      <div class="section-block">
        <h3>xmlP: подрядчик / общий XML</h3>
        <div class="form-grid">
          ${renderInput('Наименование экономического субъекта-составителя', 'xmlP.manual.economicSubjectName', contractorManual.economicSubjectName, 'string', 'half')}
          ${renderSelect('Тип акта', 'xmlP.manual.isCorrectionAct', contractorManual.isCorrectionAct || '0', { '0': '0 — первичный акт', '1': '1 — исправленный акт' }, 'half')}
          ${String(contractorManual.isCorrectionAct || '0') === '1' ? renderInput('Исправление №', 'xmlP.manual.correctionNumber', contractorManual.correctionNumber, 'string', 'quarter') : ''}
          ${String(contractorManual.isCorrectionAct || '0') === '1' ? renderInput('Дата исправления', 'xmlP.manual.correctionDate', contractorManual.correctionDate, 'string', 'quarter') : ''}
          ${renderSelect('Изменение сметы', 'xmlP.manual.hasEstimateChange', contractorManual.hasEstimateChange || '1', { '0': '0 — смета не менялась', '1': '1 — смета менялась' }, 'half')}
          ${String(contractorManual.hasEstimateChange || '1') === '1' ? renderInput('Версия сметы (КодСмет)', 'xmlP.manual.estimateVersionCode', contractorManual.estimateVersionCode, 'string', 'quarter') : ''}
          ${String(contractorManual.hasEstimateChange || '1') === '1' ? renderInput('Тип допсоглашения', 'xmlP.manual.supplementDocType', contractorManual.supplementDocType, 'string', 'quarter') : ''}
          ${String(contractorManual.hasEstimateChange || '1') === '1' ? renderInput('Номер допсоглашения', 'xmlP.manual.supplementDocNumber', contractorManual.supplementDocNumber, 'string', 'quarter') : ''}
          ${String(contractorManual.hasEstimateChange || '1') === '1' ? renderInput('Дата допсоглашения', 'xmlP.manual.supplementDocDate', contractorManual.supplementDocDate, 'string', 'quarter') : ''}
          ${renderInput('ИНН подрядчика', 'xmlP.manual.contractorInn', contractorManual.contractorInn, 'string', 'quarter')}
          ${renderInput('ИНН заказчика', 'xmlP.manual.customerInn', contractorManual.customerInn, 'string', 'quarter')}
          ${renderInput('Индекс застройщика / адреса работ', 'xmlP.manual.developerPostalIndex', contractorManual.developerPostalIndex, 'string', 'quarter')}
          ${renderInput('Код региона застройщика / адреса работ', 'xmlP.manual.developerRegionCode', contractorManual.developerRegionCode, 'string', 'quarter')}
          ${renderInput('Подписант XML — ФИО', 'xmlP.manual.signerName', contractorManual.signerName || app.state.documentContext.contractorSignerName, 'string', 'quarter')}
          ${renderInput('Подписант XML — должность', 'xmlP.manual.signerPosition', contractorManual.signerPosition || app.state.documentContext.contractorSignerPosition, 'string', 'half')}
          ${renderSelect('Подписант XML — статус', 'xmlP.manual.signerStatus', contractorManual.signerStatus || '1', { '1': '1 — без доверенности', '2': '2 — доверенность в ЭФ', '3': '3 — доверенность на бумаге' }, 'quarter')}
          ${renderSelect('Подписант XML — тип подписи', 'xmlP.manual.signatureType', contractorManual.signatureType || '1', { '1': '1 — УКЭП', '2': '2 — ПЭП', '3': '3 — УНЭП' }, 'quarter')}
          ${renderInput('ИнфПолФХЖ1 / customField', 'xmlP.manual.customInfoValue', contractorManual.customInfoValue || 'sample', 'string', 'quarter')}
          ${renderInput('Индекс подрядчика', 'xmlP.manual.contractorPostalIndex', contractorManual.contractorPostalIndex, 'string', 'quarter')}
          ${renderInput('Код региона подрядчика', 'xmlP.manual.contractorRegionCode', contractorManual.contractorRegionCode, 'string', 'quarter')}
        </div>
      </div>

      <div class="section-block">
        <h3>xmlZ: заказчик / файл Z</h3>
        <p class="kbd-note">Эти поля относятся только к customer XML. Если оставить пустыми, генератор возьмёт fallback из общих реквизитов и legacy-совместимости.</p>
        <div class="form-grid">
          ${renderInput('Составитель файла Z', 'xmlZ.manual.customerEconomicSubjectName', customerManual.customerEconomicSubjectName || app.state.documentContext.techCustomerName || app.state.documentContext.developerName, 'string', 'half')}
          ${renderInput('Основание подписания заказчика', 'xmlZ.manual.customerAuthorityDocName', customerManual.customerAuthorityDocName || 'Доверенность / основание подписания заказчика', 'string', 'half')}
          ${renderInput('Номер основания заказчика', 'xmlZ.manual.customerAuthorityDocNumber', customerManual.customerAuthorityDocNumber || app.state.documentContext.contractNumber, 'string', 'quarter')}
          ${renderInput('Дата основания заказчика', 'xmlZ.manual.customerAuthorityDocDate', customerManual.customerAuthorityDocDate || app.state.documentContext.contractDate, 'string', 'quarter')}
          ${renderSelect('Статус подписанта Z', 'xmlZ.manual.customerSignerStatus', customerSignerStatus, { '1': '1 — без доверенности', '2': '2 — доверенность в ЭФ', '3': '3 — доверенность на бумаге' }, 'quarter')}
          ${renderSelect('Тип подписи Z', 'xmlZ.manual.customerSignatureType', customerManual.customerSignatureType || contractorManual.signatureType || '1', { '1': '1 — УКЭП', '2': '2 — ПЭП', '3': '3 — УНЭП' }, 'quarter')}
          ${renderInput('Идентификатор хранения подписи Z', 'xmlZ.manual.customerSignatureStorageId', customerManual.customerSignatureStorageId, 'string', 'half')}
          ${customerSignerStatus === '2' ? renderInput('GUID / ID МЧД заказчика', 'xmlZ.manual.customerSignerPowerId', customerManual.customerSignerPowerId, 'string', 'half') : ''}
          ${customerSignerStatus === '2' ? renderInput('Внутренний номер МЧД', 'xmlZ.manual.customerSignerPowerInternalNumber', customerManual.customerSignerPowerInternalNumber || customerManual.customerAuthorityDocNumber || app.state.documentContext.contractNumber, 'string', 'quarter') : ''}
          ${customerSignerStatus === '2' ? renderInput('Дата МЧД', 'xmlZ.manual.customerSignerPowerDate', customerManual.customerSignerPowerDate || customerManual.customerAuthorityDocDate || app.state.documentContext.contractDate, 'string', 'quarter') : ''}
          ${customerSignerStatus === '3' ? renderInput('Номер бумажной доверенности', 'xmlZ.manual.customerSignerPaperPowerInternalNumber', customerManual.customerSignerPaperPowerInternalNumber || customerManual.customerAuthorityDocNumber || app.state.documentContext.contractNumber, 'string', 'quarter') : ''}
          ${customerSignerStatus === '3' ? renderInput('Дата бумажной доверенности', 'xmlZ.manual.customerSignerPaperPowerDate', customerManual.customerSignerPaperPowerDate || customerManual.customerAuthorityDocDate || app.state.documentContext.contractDate, 'string', 'quarter') : ''}
          ${customerSignerStatus === '3' ? renderInput('ФИО по бумажной доверенности', 'xmlZ.manual.customerSignerPaperPowerFio', customerManual.customerSignerPaperPowerFio || app.state.documentContext.customerSignerName, 'string', 'half') : ''}
          ${renderSelect('Приемка работ в Z', 'xmlZ.manual.customerAcceptanceCode', customerAcceptanceCode, { '1': '1 — приняты без замечаний', '2': '2 — приняты с устранимыми недостатками', '4': '4 — приняты с уменьшением стоимости', '5': '5 — приняты с возмещением расходов', '0': '0 — отказ в приемке' }, 'half')}
          ${renderInput('Дата приемки / отказа Z', 'xmlZ.manual.customerAcceptanceDate', customerManual.customerAcceptanceDate || app.state.ks2Sheets[0]?.documentDate, 'string', 'quarter')}
          ${renderTextarea('Текст приемки Z (если нужен вместо кода)', 'xmlZ.manual.customerAcceptanceText', customerManual.customerAcceptanceText, 'half')}
          ${customerAcceptanceCode === '0' ? renderTextarea('Причина отказа в приемке Z', 'xmlZ.manual.customerAcceptanceRefusalInfo', customerManual.customerAcceptanceRefusalInfo, 'half') : ''}
          ${customerAcceptanceCode === '0' ? renderInput('Документ отказа: наименование', 'xmlZ.manual.customerAcceptanceRefusalDocName', customerManual.customerAcceptanceRefusalDocName, 'string', 'half') : ''}
          ${customerAcceptanceCode === '0' ? renderInput('Документ отказа: номер', 'xmlZ.manual.customerAcceptanceRefusalDocNumber', customerManual.customerAcceptanceRefusalDocNumber, 'string', 'quarter') : ''}
          ${customerAcceptanceCode === '0' ? renderInput('Документ отказа: дата', 'xmlZ.manual.customerAcceptanceRefusalDocDate', customerManual.customerAcceptanceRefusalDocDate, 'string', 'quarter') : ''}
          ${['2', '4', '5'].includes(customerAcceptanceCode) ? renderTextarea('Сведения о недостатках / замечаниях Z', 'xmlZ.manual.customerAcceptanceDefectInfo', customerManual.customerAcceptanceDefectInfo, 'half') : ''}
          ${['2', '4', '5'].includes(customerAcceptanceCode) ? renderInput('Документ по недостаткам: наименование', 'xmlZ.manual.customerAcceptanceDefectDocName', customerManual.customerAcceptanceDefectDocName, 'string', 'half') : ''}
          ${['2', '4', '5'].includes(customerAcceptanceCode) ? renderInput('Документ по недостаткам: номер', 'xmlZ.manual.customerAcceptanceDefectDocNumber', customerManual.customerAcceptanceDefectDocNumber, 'string', 'quarter') : ''}
          ${['2', '4', '5'].includes(customerAcceptanceCode) ? renderInput('Документ по недостаткам: дата', 'xmlZ.manual.customerAcceptanceDefectDocDate', customerManual.customerAcceptanceDefectDocDate, 'string', 'quarter') : ''}
          ${customerAcceptanceCode === '4' ? renderInput('Базовая сумма уменьшения стоимости', 'xmlZ.manual.customerReductionBaseAmount', customerManual.customerReductionBaseAmount, 'number', 'quarter') : ''}
          ${customerAcceptanceCode === '4' ? renderInput('Сумма НДС по уменьшению', 'xmlZ.manual.customerReductionTaxAmount', customerManual.customerReductionTaxAmount, 'number', 'quarter') : ''}
          ${customerAcceptanceCode === '4' ? renderInput('Итого уменьшение стоимости', 'xmlZ.manual.customerReductionTotalAmount', customerManual.customerReductionTotalAmount, 'number', 'quarter') : ''}
          ${renderSelect('Извещение по расчетам Z', 'xmlZ.manual.customerSettlementNotice', customerManual.customerSettlementNotice || '', { '': '— не заполнять —', 'С представленными подрядчиком сведениями о расчетах согласен': 'С представленными подрядчиком сведениями о расчетах согласен', 'С представленными подрядчиком сведениями о расчетах согласен, есть информация о дополнительных удержаниях заказчиком в соответствии с законодательством о контрактной системе в сфере закупок товаров, работ, услуг для обеспечения государственных и муниципальных нужд': 'Согласен, есть доп. удержания по гос/мун контракту', 'С представленными подрядчиком сведениями о расчетах не согласен': 'С представленными подрядчиком сведениями о расчетах не согласен', 'Представленные подрядчиком сведения о расчетах по договору на момент приемки работ не сверялись': 'Сведения по расчетам на момент приемки не сверялись', 'Условиями договора строительного подряда сверка расчетов по договору непосредственно в акте о приемке выполненных работ не предусмотрена': 'Сверка расчетов в акте не предусмотрена' }, 'half')}
          ${renderTextarea('Причина несогласия по расчетам Z', 'xmlZ.manual.customerSettlementDisagreementReason', customerManual.customerSettlementDisagreementReason, 'half')}
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

function renderKs2ViewSwitcher(sheetIndex) {
  const mode = app.state.ui.ks2ViewMode?.[sheetIndex] === 'xml' ? 'xml' : 'form';
  return `
    <div class="segmented-switcher" role="tablist" aria-label="Режим листа КС-2">
      <button class="ghost mini ${mode === 'form' ? 'is-active' : ''}" type="button" data-action="set-ks2-view-mode" data-sheet-index="${sheetIndex}" data-mode="form">Форма</button>
      <button class="ghost mini ${mode === 'xml' ? 'is-active' : ''}" type="button" data-action="set-ks2-view-mode" data-sheet-index="${sheetIndex}" data-mode="xml">XML</button>
    </div>
  `;
}

function renderKs2Pane(sheetIndex) {
  const sheet = app.state.ks2Sheets[sheetIndex];
  if (!sheet) return '<div class="panel"><div class="empty-state">Лист КС-2 не найден.</div></div>';

  const viewMode = app.state.ui.ks2ViewMode?.[sheetIndex] === 'xml' ? 'xml' : 'form';
  return viewMode === 'xml' ? renderKs2XmlPane(sheetIndex, sheet) : renderKs2FormPane(sheetIndex, sheet);
}

function renderKs2FormPane(sheetIndex, sheet) {
  const totals = computeSheetTotals(sheet);
  const rowsHtml = sheet.rows.map((row, rowIndex) => {
    const amount = row.type === 'item' ? computeRowDisplayAmount(row) : null;
    const isDeletePending = app.state.ui.rowDeleteConfirm
      && app.state.ui.rowDeleteConfirm.sheetIndex === sheetIndex
      && app.state.ui.rowDeleteConfirm.rowIndex === rowIndex;

    return `
      <tr class="${row.type === 'section' ? 'section-row' : row.type === 'note' ? 'note-row' : ''}">
        <td>${renderTableSelect(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.type`, row.type, { item: 'Строка', section: 'Раздел', note: 'Примечание' })}</td>
        <td>${renderTableInput(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.code`, row.code)}</td>
        <td>${renderTableInput(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.lineNo`, row.lineNo)}</td>
        <td>${renderTableInput(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.estimateNo`, row.estimateNo)}</td>
        <td>${renderTableTextarea(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.name`, row.name)}</td>
        <td>${renderTableInput(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.unit`, row.unit)}</td>
        <td class="number-cell">${renderTableInput(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.quantity`, formatEditableNumber(row.quantity), 'number')}</td>
        <td class="number-cell">${renderTableInput(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.price`, formatEditableNumber(row.price), 'number')}</td>
        <td class="amount-cell">${renderTableComputed(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.__displayAmount`, `<span>${formatMoney(amount)}</span>`)}</td>
        <td class="number-cell">${renderTableInput(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.unitConsumption`, formatEditableNumber(row.unitConsumption), 'number')}</td>
        <td>${renderTableSelect(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.category`, row.category, {
          work: 'Работа',
          metal: 'Металлопрокат',
          frame: 'Каркас',
          concrete: 'Бетон',
          misc: 'Прочее',
          material: 'Материал',
        })}</td>
        <td>${renderTableTextarea(`ks2Sheets.${sheetIndex}.rows.${rowIndex}.note`, row.note)}</td>
        <td class="actions-cell">
          ${isDeletePending
            ? `<div class="row-action-stack"><button class="mini danger" data-action="confirm-delete-row" data-sheet-index="${sheetIndex}" data-row-index="${rowIndex}">Удалить</button><button class="mini ghost" data-action="cancel-delete-row" data-sheet-index="${sheetIndex}" data-row-index="${rowIndex}">Отмена</button></div>`
            : `<button class="mini danger" data-action="prompt-delete-row" data-sheet-index="${sheetIndex}" data-row-index="${rowIndex}">Удалить</button>`}
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">${escapeHtml(sheet.title || `КС-2 №${sheetIndex + 1}`)}</h2>
          <p class="panel-subtitle">Single-sheet лист КС-2. Этот экран снова активен и редактирует текущий sheet напрямую.</p>
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
        <div class="table-wrapper">
          <table class="table">
            <thead>
              <tr>
                <th>Тип</th>
                <th>Код</th>
                <th>№ п/п</th>
                <th>№ сметы</th>
                <th>Наименование</th>
                <th>Ед.</th>
                <th>Объем</th>
                <th>Цена</th>
                <th>Сумма</th>
                <th>Расход</th>
                <th>Категория</th>
                <th>Примечание</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        <div class="inline-actions">
          ${renderKs2SheetAddMenu(sheetIndex)}
          <button class="mini secondary" data-action="add-section-row" data-sheet-index="${sheetIndex}">+ Раздел</button>
          <button class="mini secondary" data-action="add-note-row" data-sheet-index="${sheetIndex}">+ Примечание</button>
        </div>
      </div>
    </div>
  `;
}

function renderKs2XmlPane(sheetIndex, sheet) {
  const logicBundle = buildLogicBundle();
  const contractorPreview = app.state.ui.ks2XmlPreview?.[String(sheetIndex)] || null;
  const customerPreview = app.state.ui.ks2CustomerXmlPreview?.[String(sheetIndex)] || null;
  const customerReadiness = buildCustomerXmlReadiness(logicBundle.model, sheetIndex, customerPreview);
  const strictCustomerReadiness = buildCustomerXmlReadiness(logicBundle.model, sheetIndex, customerPreview, { strictMode: true });
  const blockingMode = Boolean(app.state.ui.customerReadinessBlockingMode);
  const activeCustomerReadiness = blockingMode ? strictCustomerReadiness : customerReadiness;
  const advisoryEscalationCount = Math.max((strictCustomerReadiness.summary?.errors || 0) - (customerReadiness.summary?.errors || 0), 0);
  const contractorXml = prettyFormatXml(contractorPreview?.xmlText || '');
  const customerXml = prettyFormatXml(customerPreview?.xmlText || '');

  return `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">XML preview · ${escapeHtml(sheet.title || `КС-2 №${sheetIndex + 1}`)}</h2>
          <p class="panel-subtitle">Помесячный preview по текущему single-sheet листу КС-2.</p>
        </div>
        <div class="inline-actions">
          <button class="ghost mini" data-action="refresh-ks2-xml-preview-pair" data-sheet-index="${sheetIndex}">Собрать заново</button>
          <button class="ghost mini" data-action="copy-ks2-xml-preview" data-sheet-index="${sheetIndex}">Копировать P</button>
          <button class="ghost mini" data-action="copy-customer-xml-preview" data-sheet-index="${sheetIndex}">Копировать Z</button>
        </div>
      </div>

      ${renderCustomerReadinessPanel(activeCustomerReadiness, {
        title: 'Z readiness-check по текущему листу',
        subtitle: blockingMode
          ? 'Strict checklist смотрит именно на текущий single-sheet экспорт и показывает, что реально блокирует сборку P + Z.'
          : 'Чеклист смотрит именно на текущий single-sheet экспорт и показывает, где customer XML ещё живёт на fallback-значениях.',
        blockingMode,
        advisoryEscalationCount,
      })}

      <div class="section-block">
        <h3>Подрядчик (P)</h3>
        <p class="kbd-note">${contractorPreview ? `${contractorPreview.filename || 'preview.xml'} · ${contractorPreview.valid ? 'XSD OK' : 'есть ошибки'}` : 'Preview ещё не собирался.'}</p>
        ${renderXmlPreviewErrorList(contractorPreview)}
        <pre class="xml-preview">${escapeHtml(contractorXml || 'Нажми «Собрать заново», чтобы получить preview XML подрядчика.')}</pre>
      </div>

      <div class="section-block">
        <h3>Заказчик (Z)</h3>
        <p class="kbd-note">${customerPreview ? `${customerPreview.filename || 'preview-z.xml'} · ${customerPreview.valid ? 'XSD OK' : 'есть ошибки'}` : 'Preview ещё не собирался.'}</p>
        ${renderXmlPreviewErrorList(customerPreview)}
        <pre class="xml-preview">${escapeHtml(customerXml || 'Нажми «Собрать заново», чтобы получить preview XML заказчика.')}</pre>
      </div>
    </div>
  `;
}

async function loadKs2XmlPreview(sheetIndex, shouldFlash = false) {
  try {
    const response = await fetch('/api/preview-xml-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetIndex, model: buildLogicBundle().model }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || `Ошибка ${response.status}`);
    app.state.ui.ks2XmlPreview[String(sheetIndex)] = data;
    render();
    if (shouldFlash) flash(data.valid ? 'Preview XML подрядчика собран.' : 'Preview XML подрядчика собран с ошибками XSD.');
    return data;
  } catch (error) {
    if (shouldFlash) flash(`Не удалось собрать preview P: ${error.message}`);
    throw error;
  }
}

async function loadCustomerXmlPreview(sheetIndex, shouldFlash = false) {
  try {
    const response = await fetch('/api/preview-customer-xml-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetIndex, model: buildLogicBundle().model }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || `Ошибка ${response.status}`);
    app.state.ui.ks2CustomerXmlPreview[String(sheetIndex)] = data;
    render();
    if (shouldFlash) flash(data.valid ? 'Preview XML заказчика собран.' : 'Preview XML заказчика собран с ошибками XSD.');
    return data;
  } catch (error) {
    if (shouldFlash) flash(`Не удалось собрать preview Z: ${error.message}`);
    throw error;
  }
}

async function loadKs2XmlPreviewPair(sheetIndex, shouldFlash = false) {
  const results = await Promise.allSettled([
    loadKs2XmlPreview(sheetIndex, false),
    loadCustomerXmlPreview(sheetIndex, false),
  ]);
  if (shouldFlash) {
    const failed = results.find((item) => item.status === 'rejected');
    if (failed) flash(`Не удалось собрать XML preview: ${failed.reason?.message || failed.reason}`);
    else flash('Preview P + Z по листу КС-2 собран.');
  }
}

function prettyFormatXml(xmlText = '') {
  const xml = String(xmlText || '').trim();
  if (!xml) return '';
  return xml.replace(/></g, '>\n<');
}

function buildGeneratedXmlFields() {
  const generated = app.state.xmlP.generated;
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8);
  const documentNumber = app.state.ks2Sheets[0]?.documentNumber || '1';
  const contractorInn = app.state.xmlP.manual.contractorInn || '0000000000000';
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

function buildHoldbackGroupsFromRows(rows, sheetId = null) {
  const groups = [];
  let currentGroup = null;

  (rows || []).forEach((row, index) => {
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

function normalizeHoldbackRowsPerSheet(rows, ks2Sheets) {
  const groups = buildHoldbackGroupsFromRows(rows);
  const normalizedRows = [];
  const matchedGroupIndexes = new Set();

  (ks2Sheets || []).forEach((sheet) => {
    const sheetId = sheet.id;
    const sheetTotals = computeSheetTotals(sheet);
    const sheetGroupEntries = groups
      .map((group, groupIndex) => ({ group, groupIndex }))
      .filter(({ group }) => String(group.section.row.ks2SheetId || '') === String(sheetId));
    const sourceSections = sheetGroupEntries.map(({ group }) => group.section.row);
    const allSubitems = sheetGroupEntries.flatMap(({ group }) => group.subitems.map((item) => item.row));

    sheetGroupEntries.forEach(({ groupIndex }) => matchedGroupIndexes.add(groupIndex));

    const baseSection = sourceSections[0] || {};
    const mergedSection = {
      kind: 'section',
      name: 'Гарантийное удержание 3%',
      ks2SheetId: sheetId,
      ks2Amount: numberOrNull(sheetTotals.gross),
      materialsUsed: numberOrNull(sourceSections.reduce((sum, row) => sum + numberOrZero(row.materialsUsed), 0)),
      advanceReceived: null,
      advanceDoc: '',
      previousBalance: null,
      closingAmount: null,
      nextBalance: null,
      retentionAmount: null,
      payableAmount: null,
      retentionRate: numberOrNull(baseSection.retentionRate ?? 3),
      retentionDocName: sourceSections.map((row) => row.retentionDocName).find(Boolean) || 'Дополнительное соглашение о гарантийном удержании',
      retentionDocNumber: sourceSections.map((row) => row.retentionDocNumber).find(Boolean) || '',
      retentionDocDate: sourceSections.map((row) => row.retentionDocDate).find(Boolean) || '',
      retentionDocExtra: sourceSections.map((row) => row.retentionDocExtra).find(Boolean) || 'Гарантийное удержание 3% от стоимости работ',
      comment: sourceSections.map((row) => row.comment).find(Boolean) || '',
    };

    normalizedRows.push(mergedSection);
    allSubitems.forEach((subitem) => {
      normalizedRows.push({
        ...subitem,
        kind: 'subitem',
        ks2SheetId: sheetId,
      });
    });
  });

  groups.forEach((group, groupIndex) => {
    if (matchedGroupIndexes.has(groupIndex)) return;
    const fallbackSheetId = String(group.section.row.ks2SheetId || '').trim();
    normalizedRows.push({
      ...group.section.row,
      kind: 'section',
      ks2SheetId: fallbackSheetId,
    });
    group.subitems.forEach(({ row }) => {
      normalizedRows.push({
        ...row,
        kind: 'subitem',
        ks2SheetId: String(row.ks2SheetId || fallbackSheetId || '').trim(),
      });
    });
  });

  return normalizedRows;
}

function buildHoldbackGroups(sheetId = null) {
  return buildHoldbackGroupsFromRows(app.state.holdbacks.rows, sheetId);
}

function buildUnassignedHoldbackGroups() {
  return buildHoldbackGroupsFromRows(app.state.holdbacks.rows).filter((group) => !isKnownKs2SheetId(group.section.row.ks2SheetId));
}

function getOrCreateHoldbackSectionIndexForSheet(sheetIndex) {
  const sheet = app.state.ks2Sheets[sheetIndex];
  if (!sheet) return -1;
  const existingGroup = buildHoldbackGroups(sheet.id)[0];
  if (existingGroup) return existingGroup.section.index;

  const totals = computeSheetTotals(sheet);
  app.state.holdbacks.rows.push({
    kind: 'section',
    name: 'Гарантийное удержание 3%',
    ks2SheetId: sheet.id,
    ks2Amount: numberOrNull(totals.gross),
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
  });
  app.state = prepareState(app.state);
  return buildHoldbackGroups(sheet.id)[0]?.section.index ?? (app.state.holdbacks.rows.length - 1);
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

function buildKs2SheetSelectOptions() {
  const options = app.state.ks2Sheets.length > 1 ? { '': '— выбрать лист КС-2 —' } : {};
  app.state.ks2Sheets.forEach((sheet, index) => {
    const doc = sheet.document || {};
    const docNumber = sheet.documentNumber || doc.number || String(index + 1);
    const title = sheet.title || `Лист КС-2 #${index + 1}`;
    options[sheet.id] = `КС-2 №${docNumber} — ${title}`;
  });
  return options;
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

function buildAutoSettlementRowsFromHoldbacks(targetSheetId = null) {
  const groups = buildHoldbackGroups(targetSheetId);
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
        ks2SheetId: section.ks2SheetId || '',
        amount: computed.retentionAmount,
        documentRef: section.retentionDocNumber || '',
        documentName: section.retentionDocName || 'Дополнительное соглашение о гарантийном удержании',
        documentNumber: section.retentionDocNumber || '',
        documentDate: section.retentionDocDate || '',
        documentExtra: section.retentionDocExtra || section.comment || '',
        customKindText: '',
        comment: section.comment || '',
      });
    }

    group.subitems.forEach((item, subIndex) => {
      const row = item.row;
      const closingAmount = numberOrZero(row.closingAmount);
      if (closingAmount > 0) {
        const parsedDoc = parseSupportingDocumentRef(row.advanceDoc || '');
        rows.push({
          source: 'subitem-advance-closing',
          kind: 'withhold',
          kindCode: '31',
          sectionName: section.name || '',
          ks2SheetId: section.ks2SheetId || row.ks2SheetId || '',
          paymentNo: subIndex + 1,
          amount: closingAmount,
          documentRef: row.advanceDoc || '',
          documentName: row.advanceDocName || 'Документ аванса',
          documentNumber: row.advanceDocNumber || parsedDoc.documentNumber,
          documentDate: row.advanceDocDate || parsedDoc.documentDate,
          documentExtra: row.advanceDocExtra || parsedDoc.documentExtra || row.comment || '',
          customKindText: '',
          comment: row.comment || '',
        });
      }
    });
  });

  return rows;
}

function buildHoldbacksXmlSettlementModel(targetSheetId = null, { includeUnassignedManualRows = false } = {}) {
  const autoRows = buildAutoSettlementRowsFromHoldbacks(targetSheetId);
  const manualRows = (app.state.xmlExtras.settlementRows || []).map((row, rowIndex) => ({
    rowIndex,
    ...prepareSettlementRow(row),
    source: 'manual',
  })).filter((row) => {
    if (!targetSheetId) return true;
    const rowSheetId = getExplicitSettlementSheetId(row);
    if (String(rowSheetId) === String(targetSheetId)) return true;
    return includeUnassignedManualRows && !isKnownKs2SheetId(rowSheetId);
  });

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
    advanceDocName: '',
    advanceDocNumber: '',
    advanceDocDate: '',
    advanceDocExtra: '',
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

function parseSupportingDocumentRef(value) {
  const raw = String(value || '').trim();
  const parsed = {
    documentRef: raw,
    documentNumber: '',
    documentDate: '',
    documentExtra: '',
  };
  if (!raw) return parsed;

  const normalized = raw.replaceAll(' г.', '').replaceAll(' г', '');
  const match = normalized.match(/^(.*?)\s+от\s+(\d{2}\.\d{2}\.\d{4})(.*)$/i);
  if (!match) return parsed;

  parsed.documentNumber = (match[1] || '').trim();
  parsed.documentDate = match[2] || '';
  parsed.documentExtra = (match[3] || '').trim();
  return parsed;
}

function buildSettlementDocumentLabel(row = {}) {
  if (row.documentRef) return String(row.documentRef).trim();
  const numberDate = [row.documentNumber, row.documentDate].filter(Boolean).join(' от ');
  return [row.documentName, numberDate, row.documentExtra].filter(Boolean).join(' · ');
}

function prepareSettlementRow(row = {}) {
  const kind = normalizeSettlementKind(row.kind ?? row.kindLabel ?? row.type ?? row.branch);
  const kindCode = normalizeSettlementCode(kind, row.kindCode ?? row.code);
  const parsedDoc = parseSupportingDocumentRef(row.documentRef ?? row.advanceDoc ?? '');
  return {
    source: row.source || 'manual',
    kind,
    kindCode,
    amount: numberOrNull(row.amount),
    ks2SheetId: getExplicitSettlementSheetId(row),
    documentRef: row.documentRef ?? row.advanceDoc ?? '',
    documentName: row.documentName ?? '',
    documentNumber: row.documentNumber ?? parsedDoc.documentNumber,
    documentDate: row.documentDate ?? parsedDoc.documentDate,
    documentExtra: row.documentExtra ?? parsedDoc.documentExtra,
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
  const documentLabel = buildSettlementDocumentLabel(row);
  if (documentLabel) parts.push(documentLabel);
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
    'documentContext.okudKs2': ['ИнфПолФХЖ1 → form.okudKs2'],
    'documentContext.objectOkpo': ['ИнфПолФХЖ1 → form.objectOkpo'],
    'documentContext.okdpCode': ['ИнфПолФХЖ1 → form.okdpCode'],
    'documentContext.currencyCode': ['СвАктСдПр/@КодОКВДог', 'ДенИзм/@КодОКВ', 'ИнфПолФХЖ1 → form.currencyCode'],
    'documentContext.currencyName': ['ДенИзм/@НаимОКВ', 'ИнфПолФХЖ1 → form.currencyName'],
    'documentContext.contractNumber': ['СвАктСдПр/ИдДог/ТипИдДок/@НомерДок', 'ОснСдачи/ТипИдДок/@НомерДок'],
    'documentContext.contractDate': ['СвАктСдПр/ИдДог/ТипИдДок/@ДатаДок', 'ОснСдачи/ТипИдДок/@ДатаДок'],
    'documentContext.operationType': ['СвПродПер/СвПер/@СодОпер'],
    'documentContext.developerName': ['ИнфПолФХЖ1 → developer.name'],
    'documentContext.developerOkpo': ['ИнфПолФХЖ1 → developer.okpo'],
    'documentContext.techCustomerName': ['СвЗак/СвСторДог/ИдСв/СвЮЛУч/@НаимОрг', 'ИнфПолФХЖ1 → techCustomer.name'],
    'documentContext.techCustomerOkpo': ['СвЗак/СвСторДог/@ОКПО', 'ИнфПолФХЖ1 → techCustomer.okpo'],
    'documentContext.contractorName': ['СвПодр/СвСторДог/ИдСв/СвЮЛУч/@НаимОрг', 'Документ/@НаимЭкСубСост (fallback)'],
    'documentContext.contractorOkpo': ['СвПодр/СвСторДог/@ОКПО'],
    'documentContext.constructionObject': ['СвАктСдПр/@НаимОб (fallback от Стройка)'],
    'documentContext.objectName': ['СвАктСдПр/@НаимОб'],
    'documentContext.contractorSignerPosition': ['ПодписантПодр/Подписант/@Должн', 'ИнфПолФХЖ1 → contractor.signerPosition'],
    'documentContext.contractorSignerName': ['ПодписантПодр/Подписант/ФИО', 'ИнфПолФХЖ1 → contractor.signerName'],
    'documentContext.customerSignerPosition': ['ИнфПолФХЖ1 → customer.signerPosition'],
    'documentContext.customerSignerName': ['ИнфПолФХЖ1 → customer.signerName'],
    'documentContext.techCustomerSignerPosition': ['ИнфПолФХЖ1 → techCustomer.signerPosition'],
    'documentContext.techCustomerSignerName': ['ИнфПолФХЖ1 → techCustomer.signerName'],
    'documentContext.ks2DocLabel': { included: false, note: 'Используется только в визуальной форме КС-2, в XML не уходит.' },
    'documentContext.ks2DocSubtitle': { included: false, note: 'Используется только в визуальной форме КС-2, в XML не уходит.' },
    'documentContext.contractorSignLabel': { included: false, note: 'Только печатная подпись в web-форме.' },
    'documentContext.customerSignLabel': { included: false, note: 'Только печатная подпись в web-форме.' },
    'documentContext.ks2CheckedLabel': { included: false, note: 'Только печатная подпись в web-форме.' },
    'documentContext.ks2AcceptedPosition': { included: false, note: 'Только печатный блок формы КС-2.' },
    'documentContext.ks2AcceptedName': { included: false, note: 'Только печатный блок формы КС-2.' },
    'documentContext.ks2CheckedPosition': { included: false, note: 'Только печатный блок формы КС-2.' },
    'documentContext.ks2CheckedName': { included: false, note: 'Только печатный блок формы КС-2.' },


    'xml.generated.fileId': ['Файл/@ИдФайл'],
    'xml.generated.fileDate': ['Документ/@ДатаИнфПодр'],
    'xml.generated.fileTime': ['Документ/@ВремИнфПодр'],
    'xml.generated.knd': ['Документ/@КНД'],
    'xml.generated.formatVersion': ['Файл/@ВерсФорм'],
    'xml.generated.programVersion': ['Файл/@ВерсПрог'],
    'xmlP.generated.fileId': ['Файл/@ИдФайл'],
    'xmlP.generated.fileDate': ['Документ/@ДатаИнфПодр'],
    'xmlP.generated.fileTime': ['Документ/@ВремИнфПодр'],
    'xmlP.generated.knd': ['Документ/@КНД'],
    'xmlP.generated.formatVersion': ['Файл/@ВерсФорм'],
    'xmlP.generated.programVersion': ['Файл/@ВерсПрог'],

    'xmlP.constants.isGovMunicipal': ['СвАктСдПр/ОсновСтроит/@ПрГосМун'],
    'xmlP.constants.vatCalcInTotalOnly': ['СвПродПер/СвПер/@ПрНДСВИтог'],
    'xmlP.constants.cumulativeMode': { status: 'derived', targets: ['Влияет на накопительные суммы строк и итогов XML'] },
    'xmlP.constants.priceIndexYear': ['СвПродПер/СвПер/@ПрИндЦен'],
    'xmlP.constants.requiresSettlementApproval': ['СвПродПер/СвПер/@ПрСведРасчСогл'],
    'xmlP.constants.diadocCompactMode': { status: 'derived', targets: ['Влияет на структуру табличной части НаимИСт/Раздел/СвВидРаб'] },

    'xmlP.manual.economicSubjectName': ['Документ/@НаимЭкСубСост'],
    'xmlP.manual.isCorrectionAct': ['СвАктСдПр/ИспрАктСдПр (наличие узла)'],
    'xmlP.manual.correctionNumber': ['СвАктСдПр/ИспрАктСдПр/@НомИспр'],
    'xmlP.manual.correctionDate': ['СвАктСдПр/ИспрАктСдПр/@ДатаИспр'],
    'xmlP.manual.hasEstimateChange': ['СвАктСдПр/ИзмСмет (наличие узла)'],
    'xmlP.manual.estimateVersionCode': ['СвАктСдПр/ИзмСмет/@КодСмет', 'СвАктСдПр/ИдСмет/ТипИдДок/@НомерДок'],
    'xmlP.manual.supplementDocType': ['СвАктСдПр/ИзмСмет/ИдДопСогл/ТипИдДок/@НаимДок'],
    'xmlP.manual.supplementDocNumber': ['СвАктСдПр/ИзмСмет/ИдДопСогл/ТипИдДок/@НомерДок'],
    'xmlP.manual.supplementDocDate': ['СвАктСдПр/ИзмСмет/ИдДопСогл/ТипИдДок/@ДатаДок'],
    'xmlP.manual.contractorInn': ['ОснДовОргСост/ИдРекСост/ИННЮЛ', 'СвПодр/СвСторДог/ИдСв/СвЮЛУч/@ИННЮЛ'],
    'xmlP.manual.customerInn': ['СвЗак/СвСторДог/ИдСв/СвЮЛУч/@ИННЮЛ'],
    'xmlP.manual.developerPostalIndex': ['СвАктСдПр/МестВыпРаб/АдрРФ/@Индекс'],
    'xmlP.manual.developerRegionCode': ['СвАктСдПр/МестВыпРаб/АдрРФ/@КодРегион'],
    'xmlP.manual.signerName': ['ПодписантПодр/Подписант/ФИО'],
    'xmlP.manual.signerPosition': ['ПодписантПодр/Подписант/@Должн'],
    'xmlP.manual.signerStatus': ['ПодписантПодр/Подписант/@СтатПодп'],
    'xmlP.manual.signatureType': ['ПодписантПодр/Подписант/@ТипПодпис'],
    'xmlP.manual.customInfoValue': ['ИнфПолФХЖ1 → customField'],
    'xmlP.manual.contractorPostalIndex': ['СвПодр/СвСторДог/Адрес/АдрРФ/@Индекс'],
    'xmlP.manual.contractorRegionCode': ['СвПодр/СвСторДог/Адрес/АдрРФ/@КодРегион'],

    'xmlZ.manual.customerEconomicSubjectName': ['Файл Z → Документ/@НаимЭкСубСост'],
    'xmlZ.manual.customerAuthorityDocName': ['Файл Z → ДокОснПолнПодпис/ТипИдДок/@НаимДок'],
    'xmlZ.manual.customerAuthorityDocNumber': ['Файл Z → ДокОснПолнПодпис/ТипИдДок/@НомерДок'],
    'xmlZ.manual.customerAuthorityDocDate': ['Файл Z → ДокОснПолнПодпис/ТипИдДок/@ДатаДок'],
    'xmlZ.manual.customerSignerStatus': ['Файл Z → Подписант/@СтатПодп'],
    'xmlZ.manual.customerSignatureType': ['Файл Z → Подписант/@ТипПодпис'],
    'xmlZ.manual.customerSignatureStorageId': ['Файл Z → идентификатор хранения подписи / доверенности'],
    'xmlZ.manual.customerAcceptanceCode': ['Файл Z → Приемка/КодПрин'],
    'xmlZ.manual.customerAcceptanceText': ['Файл Z → Приемка/ТекстПрин'],
    'xmlZ.manual.customerSettlementNotice': ['Файл Z → СвУведРасч/ТекстУвед'],
    'xmlZ.manual.customerSettlementDisagreementReason': ['Файл Z → СвУведРасч/ПричНесогл'],
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
    return xmlBinding('derived', [], 'Legacy-данные вне active single-sheet P/Z workflow напрямую в P XML не выгружаются.');
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
    if (field === 'ks2SheetId') {
      return xmlBinding('derived', [], 'Служебная привязка ручной settlement-строки к листу КС-2: управляет тем, в какой per-sheet XML она попадет.');
    }
    if (field === 'isPrimary') {
      return xmlBinding('derived', [], 'Служебный флаг: выбирает, какая строка станет основной для XSD-ready XML в рамках текущего листа КС-2.');
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
