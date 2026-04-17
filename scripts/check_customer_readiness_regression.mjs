#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildCustomerXmlReadiness } from '../variants/modern-light/customer-readiness.js';

const DISAGREE_NOTICE = 'С представленными подрядчиком сведениями о расчетах не согласен';
const GOV_EXTRA_NOTICE = 'С представленными подрядчиком сведениями о расчетах согласен, есть информация о дополнительных удержаниях заказчиком в соответствии с законодательством о контрактной системе в сфере закупок товаров, работ, услуг для обеспечения государственных и муниципальных нужд';

function makeBaseModel() {
  return {
    documentContext: {
      developerName: 'ООО Застройщик',
      techCustomerName: 'ООО Техзаказчик',
      contractNumber: 'Д-42',
      contractDate: '2026-04-01',
      customerSignerName: 'Иванов И.И.',
      customerSignerPosition: 'Генеральный директор',
      techCustomerSignerName: 'Петров П.П.',
      techCustomerSignerPosition: 'Технический заказчик',
    },
    ks2Sheets: [
      {
        title: 'КС-2 №1',
        document: {
          number: '1',
          date: '2026-04-12',
        },
      },
    ],
    xmlP: {
      generated: {
        fileId: 'ON_AKTREZRABP_0000000000000_7701234567_20260412_001',
      },
      constants: {
        requiresSettlementApproval: '0',
        isGovMunicipal: '0',
      },
    },
    xmlZ: {
      manual: {},
    },
    xmlExtras: {
      settlement: {
        settlementRows: [
          { kind: 'withhold', kindCode: '32', amount: 1000 },
        ],
      },
    },
  };
}

function labels(issues = []) {
  return issues.map((issue) => issue.label);
}

function hasLabel(issues, label) {
  return labels(issues).includes(label);
}

{
  const model = makeBaseModel();
  const readiness = buildCustomerXmlReadiness(model, 0, null);
  assert.equal(readiness.ready, true, 'fallback-based advisory readiness should stay non-blocking');
  assert.ok(hasLabel(readiness.warnings, 'Составитель файла Z'), 'must highlight fallback subject name');
  assert.ok(hasLabel(readiness.warnings, 'Основание подписания заказчика'), 'must highlight fallback authority document');
  assert.ok(hasLabel(readiness.warnings, 'Приёмка работ в Z'), 'must highlight fallback acceptance date');
}

{
  const model = makeBaseModel();
  const strictReadiness = buildCustomerXmlReadiness(model, 0, null, { strictMode: true });
  assert.equal(strictReadiness.ready, false, 'strict readiness must turn core fallback business rules into blockers');
  assert.ok(hasLabel(strictReadiness.errors, 'Основание подписания заказчика'), 'strict readiness must block on fallback authority document');
  assert.ok(hasLabel(strictReadiness.errors, 'Приёмка работ в Z'), 'strict readiness must block on fallback acceptance date');
}

{
  const model = makeBaseModel();
  model.xmlZ.manual = {
    customerEconomicSubjectName: 'ООО Техзаказчик',
    customerAuthorityDocName: 'Доверенность',
    customerAuthorityDocNumber: 'МЧД-7',
    customerAuthorityDocDate: '2026-04-01',
    customerSignerStatus: '2',
    customerSignerPowerId: 'not-a-guid',
    customerSignerPowerDate: '2026-04-01',
    customerSignerPowerInternalNumber: 'МЧД-7',
    customerAcceptanceDate: '2026-04-12',
  };
  const readiness = buildCustomerXmlReadiness(model, 0, null);
  const strictReadiness = buildCustomerXmlReadiness(model, 0, null, { strictMode: true });
  assert.ok(hasLabel(readiness.warnings, 'МЧД / доверенность в ЭФ'), 'advisory mode must warn when customerSignerPowerId is not a GUID');
  assert.ok(hasLabel(strictReadiness.errors, 'МЧД / доверенность в ЭФ'), 'strict mode must block when customerSignerPowerId is not a GUID');
}

{
  const model = makeBaseModel();
  model.xmlP.constants.requiresSettlementApproval = '1';
  model.xmlZ.manual = {
    customerEconomicSubjectName: 'ООО Техзаказчик',
    customerAuthorityDocName: 'Доверенность',
    customerAuthorityDocNumber: '15',
    customerAuthorityDocDate: '2026-04-01',
    customerAcceptanceDate: '2026-04-12',
    customerSettlementNotice: DISAGREE_NOTICE,
  };
  const readiness = buildCustomerXmlReadiness(model, 0, null);
  assert.equal(readiness.ready, false, 'disagreement without reason should block even in advisory mode');
  assert.ok(hasLabel(readiness.errors, 'Извещение по расчётам Z'), 'must raise error for disagreement without reason');
}

{
  const model = makeBaseModel();
  model.xmlP.constants.requiresSettlementApproval = '1';
  model.xmlZ.manual = {
    customerEconomicSubjectName: 'ООО Техзаказчик',
    customerAuthorityDocName: 'Доверенность',
    customerAuthorityDocNumber: '15',
    customerAuthorityDocDate: '2026-04-01',
    customerAcceptanceDate: '2026-04-12',
    customerSettlementNotice: GOV_EXTRA_NOTICE,
  };
  model.xmlExtras.settlement.settlementRows = [];
  const readiness = buildCustomerXmlReadiness(model, 0, null);
  const strictReadiness = buildCustomerXmlReadiness(model, 0, null, { strictMode: true });
  assert.ok(hasLabel(readiness.warnings, 'Извещение по расчётам Z'), 'advisory mode must warn when gov extra notice has no settlement rows');
  assert.ok(hasLabel(strictReadiness.errors, 'Извещение по расчётам Z'), 'strict mode must block when gov extra notice has no settlement rows');
}

{
  const model = makeBaseModel();
  model.xml = {
    settlement: {
      settlementRows: [{ kind: 'withhold', kindCode: '32', amount: 1000 }],
    },
  };
  delete model.xmlExtras;
  const readiness = buildCustomerXmlReadiness(model, 0, null);
  assert.equal(readiness.ready, true, 'customer readiness must keep legacy xml.settlement fallback for older payloads');
}

console.log('OK: customer readiness regression passed');
