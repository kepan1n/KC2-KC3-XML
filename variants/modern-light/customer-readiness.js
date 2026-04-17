const SETTLEMENT_NOTICE_DEFAULT = 'Условиями договора строительного подряда сверка расчетов по договору непосредственно в акте о приемке выполненных работ не предусмотрена';
const SETTLEMENT_NOTICE_DISAGREE = 'С представленными подрядчиком сведениями о расчетах не согласен';
const SETTLEMENT_NOTICE_GOV_EXTRA = 'С представленными подрядчиком сведениями о расчетах согласен, есть информация о дополнительных удержаниях заказчиком в соответствии с законодательством о контрактной системе в сфере закупок товаров, работ, услуг для обеспечения государственных и муниципальных нужд';
const SETTLEMENT_NOTICE_ALLOWED = new Set([
  'С представленными подрядчиком сведениями о расчетах согласен',
  SETTLEMENT_NOTICE_GOV_EXTRA,
  SETTLEMENT_NOTICE_DISAGREE,
  'Представленные подрядчиком сведения о расчетах по договору на момент приемки работ не сверялись',
  SETTLEMENT_NOTICE_DEFAULT,
]);

function hasFilled(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

function firstFilledValue(...values) {
  for (const value of values) {
    if (!hasFilled(value)) continue;
    return typeof value === 'string' ? value.trim() : value;
  }
  return '';
}

function numberOrNull(value) {
  if (value === '' || value == null) return null;
  const numeric = Number(String(value).replace(',', '.'));
  return Number.isFinite(numeric) ? Math.round((numeric + Number.EPSILON) * 100) / 100 : null;
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function getCustomerManualState(source = {}) {
  return source.xmlZ?.manual || source.xml?.z?.manual || source.xml?.manual || source.xmlExtras?.manual || {};
}

function getCustomerConstantsState(source = {}) {
  return source.xmlP?.constants || source.xml?.p?.constants || source.xml?.constants || source.xmlExtras?.constants || {};
}

function getGeneratedXmlState(source = {}) {
  return source.xmlP?.generated || source.xml?.p?.generated || source.xml?.generated || source.xmlExtras?.generated || {};
}

function getSettlementState(source = {}) {
  return source.xmlExtras?.settlement || source.xml?.settlement || {};
}

function getSheetDocumentForCustomerReadiness(sheet = {}) {
  return sheet.document || {
    number: sheet.documentNumber,
    date: sheet.documentDate,
    periodFrom: sheet.periodFrom,
    periodTo: sheet.periodTo,
    basis: sheet.basis,
    vatRate: sheet.vatRate,
  };
}

function buildResolvedCustomerSigners(common = {}) {
  const candidates = [
    { name: common.customerSignerName, position: common.customerSignerPosition, source: 'customer' },
    { name: common.techCustomerSignerName, position: common.techCustomerSignerPosition, source: 'techCustomer' },
  ];

  const unique = [];
  const seen = new Set();
  candidates.forEach((candidate) => {
    const name = firstFilledValue(candidate.name);
    const position = firstFilledValue(candidate.position);
    if (!name && !position) return;
    const key = `${name || ''}::${position || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push({
      name: name || 'Иванов Иван',
      position: position || 'Уполномоченное лицо заказчика',
      source: candidate.source,
    });
  });
  return unique;
}

function documentSnapshot({ id = '', name = '', number = '', date = '', info = '' } = {}) {
  return {
    id: firstFilledValue(id),
    name: firstFilledValue(name),
    number: firstFilledValue(number),
    date: firstFilledValue(date),
    info: firstFilledValue(info),
  };
}

function hasAnyDocumentValue(doc = {}) {
  return hasFilled(doc.id) || hasFilled(doc.name) || hasFilled(doc.number) || hasFilled(doc.date) || hasFilled(doc.info);
}

function isCompleteDocument(doc = {}) {
  return hasFilled(doc.id) || (hasFilled(doc.name) && hasFilled(doc.number) && hasFilled(doc.date));
}

function formatDocumentSummary(doc = {}) {
  if (hasFilled(doc.id)) return `идентификатор ${doc.id}`;
  return [doc.name || 'без названия', doc.number || 'без номера', doc.date || 'без даты'].join(' · ');
}

function countSettlementRows(source = {}) {
  const rows = getSettlementState(source).settlementRows || [];
  return rows.filter((row) => numberOrNull(row.amount) != null && numberOrNull(row.amount) > 0).length;
}

export function buildCustomerXmlReadiness(source, sheetIndex = 0, preview = null, options = {}) {
  const { includeSheetSpecific = true, strictMode = false } = options;
  const common = source.documentContext || source.common || {};
  const manual = getCustomerManualState(source);
  const constants = getCustomerConstantsState(source);
  const generated = getGeneratedXmlState(source);
  const sheets = source.ks2Sheets || [];
  const sheet = sheets[sheetIndex] || sheets[0] || {};
  const document = getSheetDocumentForCustomerReadiness(sheet);
  const sheetLabel = sheet.title || `КС-2 #${sheetIndex + 1}`;
  const errors = [];
  const warnings = [];
  const checks = [];
  const contractorFileId = firstFilledValue(preview?.contractorFileId, generated.fileId);

  const pushCheck = (status, path, label, value, message = '', config = {}) => {
    const strictStatus = config.strictStatus || status;
    const effectiveStatus = strictMode && status !== 'error' ? strictStatus : status;
    const check = {
      status: effectiveStatus,
      baseStatus: status,
      strictStatus,
      blockingCandidate: strictStatus === 'error' && status !== 'error',
      path,
      label,
      value,
      message,
    };
    checks.push(check);
    if (effectiveStatus === 'error') errors.push({ severity: 'error', path, label, message });
    if (effectiveStatus === 'warning') warnings.push({ severity: 'warning', path, label, message });
  };

  const customerSubjectSource = hasFilled(manual.customerEconomicSubjectName)
    ? 'manual'
    : hasFilled(common.techCustomerName)
      ? 'techCustomer'
      : hasFilled(common.developerName)
        ? 'developer'
        : hasFilled(manual.economicSubjectName)
          ? 'legacyManual'
          : '';
  const customerSubjectName = firstFilledValue(
    manual.customerEconomicSubjectName,
    common.techCustomerName,
    common.developerName,
    manual.economicSubjectName,
  );
  if (!customerSubjectName) {
    pushCheck('error', 'xmlZ.manual.customerEconomicSubjectName', 'Составитель файла Z', 'не задан', 'Для файла Z не определён составитель. Иначе генератор подставит слишком общий fallback «Заказчик».');
  } else if (customerSubjectSource !== 'manual') {
    const sourceLabel = customerSubjectSource === 'techCustomer'
      ? 'из реквизитов технического заказчика'
      : customerSubjectSource === 'developer'
        ? 'из реквизитов застройщика'
        : 'из legacy manual-поля';
    pushCheck('warning', 'xmlZ.manual.customerEconomicSubjectName', 'Составитель файла Z', customerSubjectName, `Явное поле xmlZ.manual.customerEconomicSubjectName пустое — сейчас Z собирается по fallback ${sourceLabel}.`);
  } else {
    pushCheck('ok', 'xmlZ.manual.customerEconomicSubjectName', 'Составитель файла Z', customerSubjectName, 'Составитель customer XML заполнен явно.');
  }

  const explicitAuthority = documentSnapshot({
    id: firstFilledValue(manual.customerAuthorityDocId, manual.customerSignerAuthorityDocId),
    name: firstFilledValue(manual.customerAuthorityDocName, manual.customerSignerAuthorityDocName),
    number: firstFilledValue(manual.customerAuthorityDocNumber, manual.customerSignerAuthorityDocNumber),
    date: firstFilledValue(manual.customerAuthorityDocDate, manual.customerSignerAuthorityDocDate),
    info: firstFilledValue(manual.customerAuthorityDocInfo, manual.customerSignerAuthorityDocInfo),
  });
  const resolvedAuthority = documentSnapshot({
    id: explicitAuthority.id,
    name: explicitAuthority.name,
    number: firstFilledValue(explicitAuthority.number, common.contractNumber),
    date: firstFilledValue(explicitAuthority.date, common.contractDate),
    info: explicitAuthority.info,
  });
  const authorityValue = formatDocumentSummary(resolvedAuthority);
  if (!hasFilled(resolvedAuthority.date) && !hasFilled(resolvedAuthority.id)) {
    pushCheck('error', 'xmlZ.manual.customerAuthorityDocDate', 'Основание подписания заказчика', authorityValue, 'Не указана дата основания подписания заказчика. Иначе Z уйдет с дефолтной датой 01.01.2026.');
  } else if (!isCompleteDocument(explicitAuthority)) {
    const fallbackParts = [];
    if (!hasFilled(explicitAuthority.number) && hasFilled(common.contractNumber)) fallbackParts.push('номер договора');
    if (!hasFilled(explicitAuthority.date) && hasFilled(common.contractDate)) fallbackParts.push('дату договора');
    const fallbackMessage = fallbackParts.length ? ` Сейчас генератор берёт ${fallbackParts.join(' и ')} как fallback.` : ' Сейчас генератор подставит дефолтные реквизиты для недостающих частей.';
    pushCheck(
      'warning',
      !hasFilled(explicitAuthority.name) ? 'xmlZ.manual.customerAuthorityDocName' : !hasFilled(explicitAuthority.number) ? 'xmlZ.manual.customerAuthorityDocNumber' : 'xmlZ.manual.customerAuthorityDocDate',
      'Основание подписания заказчика',
      authorityValue,
      `Основание подписания заполнено не полностью или неявно.${fallbackMessage}`,
      { strictStatus: 'error' },
    );
  } else {
    pushCheck('ok', 'xmlZ.manual.customerAuthorityDocName', 'Основание подписания заказчика', authorityValue, 'Документ основания для Z заполнен явно.');
  }

  const signers = buildResolvedCustomerSigners(common);
  const signerStatus = String(firstFilledValue(manual.customerSignerStatus, manual.signerStatus, '1'));
  const signerValue = signers.length
    ? `${signers.length} шт. · ${signers.map((signer) => `${signer.name} (${signer.position})`).join('; ')}`
    : 'нет реальных подписантов';
  if (!signers.length) {
    pushCheck('error', 'documentContext.customerSignerName', 'Подписант(ы) заказчика', signerValue, 'Для Z не найден ни один осмысленный подписант заказчика. Иначе генератор подставит fallback «Иванов Иван».');
  } else if (!signers.some((signer) => signer.source === 'customer')) {
    pushCheck('warning', 'documentContext.customerSignerName', 'Подписант(ы) заказчика', signerValue, `Явные поля заказчика пустые — для Z используются fallback-подписанты из блока техзаказчика. Статус подписанта: ${signerStatus}.`, { strictStatus: 'error' });
  } else {
    pushCheck('ok', 'documentContext.customerSignerName', 'Подписант(ы) заказчика', signerValue, `Подписанты для Z определены. Статус подписанта: ${signerStatus}.`);
  }

  if (signerStatus === '2') {
    const explicitMchd = {
      powerId: firstFilledValue(manual.customerSignerPowerId),
      number: firstFilledValue(manual.customerSignerPowerNumber),
      date: firstFilledValue(manual.customerSignerPowerDate),
      internalNumber: firstFilledValue(manual.customerSignerPowerInternalNumber),
      registrationDate: firstFilledValue(manual.customerSignerPowerRegistrationDate),
      systemMark: firstFilledValue(manual.customerSignerPowerSystemMark),
      storageId: firstFilledValue(manual.customerSignatureStorageId),
    };
    const resolvedMchd = {
      powerId: firstFilledValue(explicitMchd.powerId, explicitMchd.number),
      date: firstFilledValue(explicitMchd.date, resolvedAuthority.date),
      internalNumber: firstFilledValue(explicitMchd.internalNumber, resolvedAuthority.number),
      registrationDate: explicitMchd.registrationDate,
      systemMark: explicitMchd.systemMark,
      storageId: explicitMchd.storageId,
    };
    const mchdValue = [resolvedMchd.powerId || 'без GUID/номера', resolvedMchd.internalNumber || 'без вн. номера', resolvedMchd.date || 'без даты'].join(' · ');
    const hasAnyResolved = hasFilled(resolvedMchd.powerId) || hasFilled(resolvedMchd.internalNumber) || hasFilled(resolvedMchd.date) || hasFilled(resolvedMchd.registrationDate) || hasFilled(resolvedMchd.systemMark);
    const hasExplicitSpecific = hasFilled(explicitMchd.powerId) || hasFilled(explicitMchd.number) || hasFilled(explicitMchd.date) || hasFilled(explicitMchd.internalNumber) || hasFilled(explicitMchd.registrationDate) || hasFilled(explicitMchd.systemMark);
    if (!hasAnyResolved) {
      pushCheck('error', 'xmlZ.manual.customerSignerPowerId', 'МЧД / доверенность в ЭФ', mchdValue, 'Для статуса 2 не хватает реквизитов доверенности / МЧД. Генератор не сможет собрать осмысленный блок СвДовер.');
    } else if (hasFilled(explicitMchd.powerId) && !isUuidLike(explicitMchd.powerId)) {
      pushCheck('warning', 'xmlZ.manual.customerSignerPowerId', 'МЧД / доверенность в ЭФ', mchdValue, 'Значение customerSignerPowerId задано, но не похоже на GUID МЧД. Генератор не положит его в НомДовер как UUID.', { strictStatus: 'error' });
    } else if (!hasExplicitSpecific) {
      pushCheck('warning', 'xmlZ.manual.customerSignerPowerId', 'МЧД / доверенность в ЭФ', mchdValue, 'Для статуса 2 сейчас используются только fallback-данные из общего основания подписания. Лучше заполнить customerSignerPower* явно.', { strictStatus: 'error' });
    } else {
      pushCheck('ok', 'xmlZ.manual.customerSignerPowerId', 'МЧД / доверенность в ЭФ', mchdValue, 'Для статуса 2 есть явные реквизиты МЧД / доверенности в ЭФ.');
    }

    if (!hasFilled(explicitMchd.storageId)) {
      pushCheck('warning', 'xmlZ.manual.customerSignatureStorageId', 'Идентификатор хранения подписи Z', 'не задан', 'Для статуса 2 лучше явно заполнить customerSignatureStorageId, чтобы связка подписи / доверенности в Z не выглядела пустой.');
    } else {
      pushCheck('ok', 'xmlZ.manual.customerSignatureStorageId', 'Идентификатор хранения подписи Z', explicitMchd.storageId, 'Идентификатор хранения подписи / доверенности заполнен.');
    }
  }

  if (signerStatus === '3') {
    const explicitPaper = {
      date: firstFilledValue(manual.customerSignerPaperPowerDate),
      internalNumber: firstFilledValue(manual.customerSignerPaperPowerInternalNumber),
      identity: firstFilledValue(manual.customerSignerPaperPowerIdentity),
      fio: firstFilledValue(manual.customerSignerPaperPowerFio),
      storageId: firstFilledValue(manual.customerSignatureStorageId),
    };
    const resolvedPaper = {
      date: firstFilledValue(explicitPaper.date, resolvedAuthority.date),
      internalNumber: firstFilledValue(explicitPaper.internalNumber, resolvedAuthority.number),
      identity: firstFilledValue(explicitPaper.identity, resolvedAuthority.id),
      fio: explicitPaper.fio,
      storageId: explicitPaper.storageId,
    };
    const paperValue = [resolvedPaper.internalNumber || 'без номера', resolvedPaper.date || 'без даты', resolvedPaper.fio || 'без ФИО доверенного лица'].join(' · ');
    const hasAnyResolved = hasFilled(resolvedPaper.date) || hasFilled(resolvedPaper.internalNumber) || hasFilled(resolvedPaper.identity) || hasFilled(resolvedPaper.fio);
    const hasExplicitSpecific = hasFilled(explicitPaper.date) || hasFilled(explicitPaper.internalNumber) || hasFilled(explicitPaper.identity) || hasFilled(explicitPaper.fio);
    const hasMinimumPaper = hasFilled(resolvedPaper.date) && (hasFilled(resolvedPaper.internalNumber) || hasFilled(resolvedPaper.identity) || hasFilled(resolvedPaper.fio));
    if (!hasAnyResolved) {
      pushCheck('error', 'xmlZ.manual.customerSignerPaperPowerDate', 'Бумажная доверенность Z', paperValue, 'Для статуса 3 не хватает реквизитов бумажной доверенности.');
    } else if (!hasMinimumPaper) {
      pushCheck('warning', 'xmlZ.manual.customerSignerPaperPowerDate', 'Бумажная доверенность Z', paperValue, 'Для бумажной доверенности лучше указать дату и хотя бы внутренний номер / идентификатор / ФИО доверенного лица.', { strictStatus: 'error' });
    } else if (!hasExplicitSpecific) {
      pushCheck('warning', 'xmlZ.manual.customerSignerPaperPowerDate', 'Бумажная доверенность Z', paperValue, 'Для статуса 3 сейчас используются fallback-данные из общего основания подписания. Лучше заполнить customerSignerPaperPower* явно.', { strictStatus: 'error' });
    } else {
      pushCheck('ok', 'xmlZ.manual.customerSignerPaperPowerDate', 'Бумажная доверенность Z', paperValue, 'Для статуса 3 есть явные реквизиты бумажной доверенности.');
    }

    if (!hasFilled(explicitPaper.storageId)) {
      pushCheck('warning', 'xmlZ.manual.customerSignatureStorageId', 'Идентификатор хранения подписи Z', 'не задан', 'Для статуса 3 лучше явно заполнить customerSignatureStorageId, если подпись / доверенность хранятся в системе.');
    } else {
      pushCheck('ok', 'xmlZ.manual.customerSignatureStorageId', 'Идентификатор хранения подписи Z', explicitPaper.storageId, 'Идентификатор хранения подписи / доверенности заполнен.');
    }
  }

  const acceptanceCode = String(firstFilledValue(manual.customerAcceptanceCode, '1'));
  const acceptanceText = firstFilledValue(manual.customerAcceptanceText);
  const explicitAcceptanceDate = firstFilledValue(manual.customerAcceptanceDate);
  const acceptanceDate = firstFilledValue(explicitAcceptanceDate, document.date);
  const acceptanceLabel = acceptanceText || acceptanceCode;
  const refusalDoc = documentSnapshot({
    id: manual.customerAcceptanceRefusalDocId,
    name: manual.customerAcceptanceRefusalDocName,
    number: manual.customerAcceptanceRefusalDocNumber,
    date: manual.customerAcceptanceRefusalDocDate,
  });
  const defectDoc = documentSnapshot({
    id: manual.customerAcceptanceDefectDocId,
    name: manual.customerAcceptanceDefectDocName,
    number: manual.customerAcceptanceDefectDocNumber,
    date: manual.customerAcceptanceDefectDocDate,
  });
  if (!acceptanceDate) {
    pushCheck('error', 'xmlZ.manual.customerAcceptanceDate', 'Приёмка работ в Z', `${acceptanceLabel || 'не задано'} · дата не определена`, 'Не определена дата приемки / отказа для Z.');
  } else if (acceptanceCode === '4' && numberOrNull(manual.customerReductionBaseAmount) == null) {
    pushCheck('error', 'xmlZ.manual.customerReductionBaseAmount', 'Приёмка работ в Z', `${acceptanceLabel} · ${acceptanceDate}`, 'Для кода 4 нужно заполнить базовую сумму уменьшения стоимости договора.');
  } else if (acceptanceCode === '4' && !hasFilled(manual.customerReductionTaxAmount) && !hasFilled(manual.customerReductionTotalAmount) && !hasFilled(manual.customerReductionToBePaidAmount) && !hasFilled(manual.customerReductionToBePaidFromStartAmount)) {
    pushCheck('warning', 'xmlZ.manual.customerReductionTaxAmount', 'Приёмка работ в Z', `${acceptanceLabel} · ${acceptanceDate}`, 'Для кода 4 желательно дополнительно заполнить НДС и/или итоговые суммы уменьшения, иначе Z будет собран только с базовой суммой.');
  } else if (acceptanceCode === '0' && !firstFilledValue(manual.customerAcceptanceRefusalInfo) && !hasAnyDocumentValue(refusalDoc)) {
    pushCheck('warning', 'xmlZ.manual.customerAcceptanceRefusalInfo', 'Приёмка работ в Z', `${acceptanceLabel} · ${acceptanceDate}`, 'Для отказа в приемке лучше указать причину и/или документ отказа.', { strictStatus: 'error' });
  } else if (acceptanceCode === '0' && hasAnyDocumentValue(refusalDoc) && !isCompleteDocument(refusalDoc)) {
    pushCheck('warning', 'xmlZ.manual.customerAcceptanceRefusalDocName', 'Приёмка работ в Z', `${acceptanceLabel} · ${acceptanceDate}`, 'Документ отказа заполнен не полностью: лучше дать полное наименование, номер и дату или идентификатор документа.', { strictStatus: 'error' });
  } else if (['2', '4', '5'].includes(acceptanceCode) && !firstFilledValue(manual.customerAcceptanceDefectInfo) && !hasAnyDocumentValue(defectDoc)) {
    pushCheck('warning', 'xmlZ.manual.customerAcceptanceDefectInfo', 'Приёмка работ в Z', `${acceptanceLabel} · ${acceptanceDate}`, 'Для этого кода приемки лучше указать сведения о недостатках и/или подтверждающий документ.', { strictStatus: 'error' });
  } else if (['2', '4', '5'].includes(acceptanceCode) && hasAnyDocumentValue(defectDoc) && !isCompleteDocument(defectDoc)) {
    pushCheck('warning', 'xmlZ.manual.customerAcceptanceDefectDocName', 'Приёмка работ в Z', `${acceptanceLabel} · ${acceptanceDate}`, 'Документ о недостатках заполнен не полностью: лучше дать полное наименование, номер и дату или идентификатор документа.', { strictStatus: 'error' });
  } else if (!explicitAcceptanceDate && hasFilled(document.date)) {
    pushCheck('warning', 'xmlZ.manual.customerAcceptanceDate', 'Приёмка работ в Z', `${acceptanceLabel} · ${acceptanceDate}`, 'Дата приемки для Z не заполнена явно — используется дата текущего листа КС-2 как fallback.', { strictStatus: 'error' });
  } else {
    pushCheck('ok', 'xmlZ.manual.customerAcceptanceCode', 'Приёмка работ в Z', `${acceptanceLabel} · ${acceptanceDate}`, 'Реквизиты приемки для Z выглядят заполненными.');
  }

  const settlementNotice = firstFilledValue(manual.customerSettlementNotice);
  const ignoredDoc = documentSnapshot({
    id: manual.customerSettlementIgnoredDocId,
    name: manual.customerSettlementIgnoredDocName,
    number: manual.customerSettlementIgnoredDocNumber,
    date: manual.customerSettlementIgnoredDocDate,
  });
  const extraDoc = documentSnapshot({
    id: manual.customerSettlementExtraDocId,
    name: manual.customerSettlementExtraDocName,
    number: manual.customerSettlementExtraDocNumber,
    date: manual.customerSettlementExtraDocDate,
  });
  const settlementRowsCount = countSettlementRows(source);
  if (settlementNotice && !SETTLEMENT_NOTICE_ALLOWED.has(settlementNotice)) {
    pushCheck('error', 'xmlZ.manual.customerSettlementNotice', 'Извещение по расчётам Z', settlementNotice, 'Задан текст извещения, который не поддерживается схемой customer XML Z.');
  } else if (String(constants.requiresSettlementApproval || '0') === '1' && !settlementNotice) {
    pushCheck('warning', 'xmlZ.manual.customerSettlementNotice', 'Извещение по расчётам Z', 'не выбрано', 'В XML включен режим согласования расчетов, но текст извещения заказчика пока не выбран.', { strictStatus: 'error' });
  } else if (settlementNotice === SETTLEMENT_NOTICE_DISAGREE && !firstFilledValue(manual.customerSettlementDisagreementReason)) {
    pushCheck('error', 'xmlZ.manual.customerSettlementDisagreementReason', 'Извещение по расчётам Z', settlementNotice, 'Для несогласия по расчетам нужно заполнить причину несогласия.');
  } else if (settlementNotice === SETTLEMENT_NOTICE_GOV_EXTRA && String(constants.isGovMunicipal || '0') !== '1') {
    pushCheck('warning', 'xmlP.constants.isGovMunicipal', 'Извещение по расчётам Z', settlementNotice, 'Текст извещения говорит о дополнительных удержаниях по гос/мун контракту, но признак ПрГосМун сейчас выключен.', { strictStatus: 'error' });
  } else if (settlementNotice === SETTLEMENT_NOTICE_GOV_EXTRA && settlementRowsCount === 0) {
    pushCheck('warning', 'xmlZ.manual.customerSettlementNotice', 'Извещение по расчётам Z', settlementNotice, 'Выбрано извещение про дополнительные удержания заказчика, но в текущем payload не видно ни одной суммы требований / удержаний.', { strictStatus: 'error' });
  } else if (hasAnyDocumentValue(ignoredDoc) && !isCompleteDocument(ignoredDoc)) {
    pushCheck('warning', 'xmlZ.manual.customerSettlementIgnoredDocName', 'Извещение по расчётам Z', settlementNotice || 'документ неучтённых расчётов', 'ИдНеучтенДок заполнен не полностью: лучше дать полное наименование, номер и дату или идентификатор документа.', { strictStatus: 'error' });
  } else if (hasAnyDocumentValue(extraDoc) && !isCompleteDocument(extraDoc)) {
    pushCheck('warning', 'xmlZ.manual.customerSettlementExtraDocName', 'Извещение по расчётам Z', settlementNotice || 'документ лишних расчётов', 'ИдЛишнДок заполнен не полностью: лучше дать полное наименование, номер и дату или идентификатор документа.', { strictStatus: 'error' });
  } else {
    pushCheck('ok', 'xmlZ.manual.customerSettlementNotice', 'Извещение по расчётам Z', settlementNotice || 'не требуется / не выбрано', settlementNotice ? 'Текст извещения заказчика выглядит консистентным.' : 'Извещение по расчетам не требуется или не используется в текущем профиле.');
  }

  if (includeSheetSpecific) {
    const postingNumber = firstFilledValue(document.number);
    const postingDate = firstFilledValue(document.date);
    pushCheck(
      postingNumber && postingDate ? 'ok' : 'error',
      postingNumber ? `ks2Sheets.${sheetIndex}.document.date` : `ks2Sheets.${sheetIndex}.document.number`,
      'Постановочный документ Z',
      [postingNumber || 'без номера', postingDate || 'без даты'].join(' · '),
      postingNumber && postingDate ? 'Номер и дата постановочного документа для текущего листа определены.' : 'Для Z по текущему листу не хватает номера или даты постановочного документа.',
    );

    pushCheck(
      contractorFileId ? 'ok' : 'error',
      'xmlP.generated.fileId',
      'Связка с P-файлом',
      contractorFileId || 'не определена',
      contractorFileId ? 'Customer XML будет ссылаться на соответствующий файл подрядчика.' : 'Не удалось определить идентификатор связанного P-файла.',
    );
  }

  return {
    ready: errors.length === 0,
    strictMode,
    errors,
    warnings,
    issues: [...errors, ...warnings],
    checks,
    sheetLabel,
    summary: {
      ok: checks.filter((item) => item.status === 'ok').length,
      warnings: warnings.length,
      errors: errors.length,
      blockingCandidates: checks.filter((item) => item.blockingCandidate).length,
    },
  };
}
