#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from lxml import etree as ET

ROOT = Path(__file__).resolve().parents[1]
XSD_Z = ROOT / 'nalog docs' / 'ON_AKTREZRABZ.xsd'
DEFAULT_OUTPUT = ROOT / 'output' / 'small-sample-customer.xml'

SETTLEMENT_NOTICE_DEFAULT = (
    'Условиями договора строительного подряда сверка расчетов по договору непосредственно '
    'в акте о приемке выполненных работ не предусмотрена'
)
SETTLEMENT_NOTICE_ALLOWED = {
    'С представленными подрядчиком сведениями о расчетах согласен',
    'С представленными подрядчиком сведениями о расчетах согласен, есть информация о дополнительных удержаниях заказчиком в соответствии с законодательством о контрактной системе в сфере закупок товаров, работ, услуг для обеспечения государственных и муниципальных нужд',
    'С представленными подрядчиком сведениями о расчетах не согласен',
    'Представленные подрядчиком сведения о расчетах по договору на момент приемки работ не сверялись',
    SETTLEMENT_NOTICE_DEFAULT,
}


def parse_args():
    parser = argparse.ArgumentParser(description='Generate customer XML (ON_AKTREZRABZ) from exported JSON model')
    parser.add_argument('input_json', help='Path to exported JSON from web form')
    parser.add_argument('--contractor-xml', help='Path to contractor XML (P file) to copy file id/date/time', required=False)
    parser.add_argument('-o', '--output', default=str(DEFAULT_OUTPUT), help='Output XML path')
    return parser.parse_args()


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


def load_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def fmt_time_dots(value: str | None) -> str:
    value = str(value or '00:00:00')
    return value.replace(':', '.')


def fmt_money(value) -> str:
    try:
        number = float(value or 0)
    except Exception:
        number = 0.0
    return f'{number:.2f}'


def get_ks2_first_doc(data: dict) -> dict:
    ks2_sheets = data.get('ks2Sheets', [])
    first_sheet = ks2_sheets[0] if ks2_sheets else {}
    return first_sheet.get('document') or {
        'number': first_sheet.get('documentNumber'),
        'date': first_sheet.get('documentDate'),
        'periodFrom': first_sheet.get('periodFrom'),
        'periodTo': first_sheet.get('periodTo'),
        'basis': first_sheet.get('basis'),
        'vatRate': first_sheet.get('vatRate'),
    }


def get_ks3_doc(data: dict) -> dict:
    ks3 = data.get('ks3', {})
    document = ks3.get('document') or {}
    return {
        'number': first_non_empty(document.get('number'), document.get('documentNumber')),
        'date': first_non_empty(document.get('date'), document.get('documentDate')),
        'periodFrom': first_non_empty(document.get('periodFrom')),
        'periodTo': first_non_empty(document.get('periodTo')),
    }


def make_customer_file_id(contractor_file_id: str, generated: dict) -> str:
    explicit = first_non_empty(
        generated.get('customerFileId'),
        generated.get('zFileId'),
    )
    if explicit:
        return explicit
    if contractor_file_id.startswith('ON_AKTREZRABP_'):
        return 'ON_AKTREZRABZ_' + contractor_file_id[len('ON_AKTREZRABP_'):]
    return f'ON_AKTREZRABZ_{contractor_file_id[-30:]}'


def add_doc_reference(parent: ET._Element, tag_name: str, name: str | None, number: str | None, date: str | None, *, inn: str | None = None, doc_id: str | None = None, extra_info: str | None = None):
    block = ET.SubElement(parent, tag_name)
    attrs = {}
    if doc_id:
        attrs['ИдДок'] = str(doc_id)
    else:
        attrs['НаимДок'] = first_non_empty(name, default='Без названия')
        attrs['НомерДок'] = first_non_empty(number, default='Без номера')
        attrs['ДатаДок'] = fmt_date(date)
    if extra_info:
        attrs['ДопСведДок'] = str(extra_info)
    doc_el = ET.SubElement(block, 'ТипИдДок', **attrs)
    inn_value = first_non_empty(inn)
    if inn_value:
        subject = ET.SubElement(doc_el, 'ИдРекСост')
        ET.SubElement(subject, 'ИННЮЛ').text = inn_value
    return block


def build_customer_signers(common: dict, manual: dict) -> list[dict]:
    candidates = [
        {
            'name': common.get('ks3DeveloperName'),
            'position': common.get('ks3DeveloperPosition'),
            'source': 'ks3Developer',
        },
        {
            'name': common.get('customerSignerName'),
            'position': common.get('customerSignerPosition'),
            'source': 'customerSigner',
        },
        {
            'name': common.get('ks3TechCustomerName'),
            'position': common.get('ks3TechCustomerPosition'),
            'source': 'ks3TechCustomer',
        },
        {
            'name': common.get('techCustomerSignerName'),
            'position': common.get('techCustomerSignerPosition'),
            'source': 'techCustomerSigner',
        },
    ]

    unique = []
    seen = set()
    for candidate in candidates:
        name = first_non_empty(candidate.get('name'))
        position = first_non_empty(candidate.get('position'))
        if not name and not position:
            continue
        key = (name or '', position or '')
        if key in seen:
            continue
        seen.add(key)
        unique.append({
            'name': name or 'Иванов Иван',
            'position': position or 'Уполномоченное лицо заказчика',
            'source': candidate['source'],
        })

    if not unique:
        unique.append({
            'name': first_non_empty(common.get('customerSignerName'), common.get('techCustomerSignerName'), default='Иванов Иван'),
            'position': first_non_empty(common.get('customerSignerPosition'), common.get('techCustomerSignerPosition'), default='Уполномоченное лицо заказчика'),
            'source': 'fallback',
        })

    signer_status = first_non_empty(manual.get('customerSignerStatus'), manual.get('signerStatus'), default='1')
    signature_type = first_non_empty(manual.get('customerSignatureType'), manual.get('signatureType'), default='1')
    storage_id = first_non_empty(manual.get('customerSignatureStorageId'))

    enriched = []
    for signer in unique:
        enriched.append({
            **signer,
            'status': signer_status,
            'signatureType': signature_type,
            'storageId': storage_id,
        })
    return enriched


def add_signer_authority(signer_parent: ET._Element, signer_data: dict, manual: dict):
    status = str(signer_data.get('status') or '')

    if status == '2':
        attrs = {}
        power_id = first_non_empty(manual.get('customerSignerPowerId'), manual.get('customerSignerPowerNumber'))
        power_date = first_non_empty(manual.get('customerSignerPowerDate'), manual.get('customerAuthorityDocDate'))
        internal_number = first_non_empty(manual.get('customerSignerPowerInternalNumber'), manual.get('customerAuthorityDocNumber'))
        registration_date = first_non_empty(manual.get('customerSignerPowerRegistrationDate'))
        system_mark = first_non_empty(manual.get('customerSignerPowerSystemMark'))

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
        paper_date = first_non_empty(manual.get('customerSignerPaperPowerDate'), manual.get('customerAuthorityDocDate'))
        internal_number = first_non_empty(manual.get('customerSignerPaperPowerInternalNumber'), manual.get('customerAuthorityDocNumber'))
        power_identity = first_non_empty(manual.get('customerSignerPaperPowerIdentity'), manual.get('customerAuthorityDocId'))
        paper_fio = first_non_empty(manual.get('customerSignerPaperPowerFio'))

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



def add_settlement_notice(content: ET._Element, manual: dict):
    notice_text = first_non_empty(manual.get('customerSettlementNotice'))
    if not notice_text:
        return
    if notice_text not in SETTLEMENT_NOTICE_ALLOWED:
        raise ValueError(
            'Недопустимое значение xml.manual.customerSettlementNotice для схемы Z: '
            f'{notice_text!r}'
        )

    notice = ET.SubElement(content, 'ИзвОРасч', ИзвПоРасч=notice_text)
    disagreement_reason = first_non_empty(manual.get('customerSettlementDisagreementReason'))
    if disagreement_reason:
        notice.set('ПричНесогРасч', disagreement_reason)

    ignored_doc_name = first_non_empty(manual.get('customerSettlementIgnoredDocName'))
    ignored_doc_number = first_non_empty(manual.get('customerSettlementIgnoredDocNumber'))
    ignored_doc_date = first_non_empty(manual.get('customerSettlementIgnoredDocDate'))
    if ignored_doc_name or ignored_doc_number or ignored_doc_date:
        add_doc_reference(
            notice,
            'ИдНеучтенДок',
            ignored_doc_name,
            ignored_doc_number,
            ignored_doc_date,
            inn=manual.get('customerInn'),
            doc_id=manual.get('customerSettlementIgnoredDocId'),
        )

    extra_doc_name = first_non_empty(manual.get('customerSettlementExtraDocName'))
    extra_doc_number = first_non_empty(manual.get('customerSettlementExtraDocNumber'))
    extra_doc_date = first_non_empty(manual.get('customerSettlementExtraDocDate'))
    if extra_doc_name or extra_doc_number or extra_doc_date:
        add_doc_reference(
            notice,
            'ИдЛишнДок',
            extra_doc_name,
            extra_doc_number,
            extra_doc_date,
            inn=manual.get('customerInn'),
            doc_id=manual.get('customerSettlementExtraDocId'),
        )


def build_operation_kind(common: dict) -> str:
    explicit = first_non_empty(common.get('operationType'))
    if explicit:
        return explicit
    label = first_non_empty(common.get('ks3DocLabel'))
    subtitle = first_non_empty(common.get('ks3DocSubtitle'))
    if label and subtitle:
        return f'{label} {subtitle}'
    return first_non_empty(label, subtitle, default='Сдача-приемка результатов работ')


def build_acceptance_block(content: ET._Element, data: dict, manual: dict, accepted_date: str):
    acceptance_code = str(first_non_empty(manual.get('customerAcceptanceCode'), default='1'))
    acceptance_text = first_non_empty(manual.get('customerAcceptanceText'))
    attrs = {}
    if acceptance_text:
        attrs['СодОпер'] = acceptance_text
    else:
        attrs['КодСодОпер'] = acceptance_code

    refusal_info = first_non_empty(manual.get('customerAcceptanceRefusalInfo'))
    if refusal_info:
        attrs['ИнфОтказПрием'] = refusal_info

    defect_info = first_non_empty(manual.get('customerAcceptanceDefectInfo'))
    if defect_info:
        attrs['ИнфОНедостатк'] = defect_info

    ndfl_amount = first_non_empty(manual.get('customerAcceptanceNdflAmount'))
    if ndfl_amount:
        attrs['СумНДФЛ'] = fmt_money(ndfl_amount)

    acceptance = ET.SubElement(content, 'СвПрием', **attrs)

    if acceptance_text or acceptance_code in {'1', '2', '4', '5'}:
        ET.SubElement(acceptance, 'ДатаПрин').text = fmt_date(first_non_empty(manual.get('customerAcceptanceDate'), accepted_date))
    elif acceptance_code == '0':
        ET.SubElement(acceptance, 'ДатаОтказПрин').text = fmt_date(first_non_empty(manual.get('customerAcceptanceRefusalDate'), accepted_date))

    if acceptance_code == '0' and (
        manual.get('customerAcceptanceRefusalDocName')
        or manual.get('customerAcceptanceRefusalDocNumber')
        or manual.get('customerAcceptanceRefusalDocDate')
        or manual.get('customerAcceptanceRefusalDocId')
    ):
        add_doc_reference(
            acceptance,
            'ИдДокОтказ',
            manual.get('customerAcceptanceRefusalDocName'),
            manual.get('customerAcceptanceRefusalDocNumber'),
            manual.get('customerAcceptanceRefusalDocDate'),
            inn=manual.get('customerInn'),
            doc_id=manual.get('customerAcceptanceRefusalDocId'),
        )

    if acceptance_code in {'2', '4', '5'} and (
        manual.get('customerAcceptanceDefectDocName')
        or manual.get('customerAcceptanceDefectDocNumber')
        or manual.get('customerAcceptanceDefectDocDate')
        or manual.get('customerAcceptanceDefectDocId')
    ):
        add_doc_reference(
            acceptance,
            'ИдДокОНедостатк',
            manual.get('customerAcceptanceDefectDocName'),
            manual.get('customerAcceptanceDefectDocNumber'),
            manual.get('customerAcceptanceDefectDocDate'),
            inn=manual.get('customerInn'),
            doc_id=manual.get('customerAcceptanceDefectDocId'),
        )

    if acceptance_code == '4':
        reduction = ET.SubElement(
            acceptance,
            'ИтогУмСтоимДог',
            СтТовБезНДСИтог=fmt_money(manual.get('customerReductionBaseAmount')),
        )
        tax_total = first_non_empty(manual.get('customerReductionTaxAmount'))
        if tax_total not in (None, ''):
            ET.SubElement(reduction, 'СумНалИтог').text = fmt_money(tax_total)
        else:
            ET.SubElement(reduction, 'ОтсСумНДС').text = '-'

        total_with_tax = first_non_empty(manual.get('customerReductionTotalAmount'))
        if total_with_tax not in (None, ''):
            reduction.set('СтТовУчНалИтог', fmt_money(total_with_tax))
        total_to_period = first_non_empty(manual.get('customerReductionToBePaidAmount'))
        if total_to_period not in (None, ''):
            reduction.set('ИтогКПеречислОтч', fmt_money(total_to_period))
        total_to_cumulative = first_non_empty(manual.get('customerReductionToBePaidFromStartAmount'))
        if total_to_cumulative not in (None, ''):
            reduction.set('ИтогКПеречислСНач', fmt_money(total_to_cumulative))

    return acceptance


def build_customer_xml(data: dict, contractor_xml_path: Path | None = None) -> ET._ElementTree:
    common = data.get('common', {})
    xml = data.get('xml', {})
    generated = xml.get('generated', {})
    manual = xml.get('manual', {})
    constants = xml.get('constants', {})

    first_doc = get_ks2_first_doc(data)
    ks3_doc = get_ks3_doc(data)

    contractor_file_id = generated.get('fileId') or 'ON_AKTREZRABP_UNKNOWN'
    contractor_file_date = fmt_date(generated.get('fileDate'))
    contractor_file_time = fmt_time_dots(generated.get('fileTime') or '00:00:00')
    if contractor_xml_path and contractor_xml_path.exists():
        root_p = ET.parse(str(contractor_xml_path)).getroot()
        doc_p = root_p.find('Документ')
        contractor_file_id = root_p.get('ИдФайл') or contractor_file_id
        if doc_p is not None:
            contractor_file_date = doc_p.get('ДатаИнфПодр') or contractor_file_date
            contractor_file_time = fmt_time_dots(doc_p.get('ВремИнфПодр') or contractor_file_time)

    customer_subject_name = first_non_empty(
        manual.get('customerEconomicSubjectName'),
        common.get('ks3TechCustomerOrgName'),
        common.get('techCustomerName'),
        common.get('ks3DeveloperOrgName'),
        common.get('developerName'),
        manual.get('economicSubjectName'),
        default='Заказчик',
    )

    root = ET.Element(
        'Файл',
        ИдФайл=make_customer_file_id(contractor_file_id, generated),
        ВерсПрог=generated.get('programVersion') or 'KC2-KC3-XML-webapp',
        ВерсФорм=generated.get('formatVersion') or '1.00',
    )
    doc = ET.SubElement(
        root,
        'Документ',
        КНД='1110336',
        ДатИнфЗак=fmt_date(generated.get('fileDate')),
        ВрИнфЗак=fmt_time_dots(generated.get('fileTime') or '00:00:00'),
        НаимЭконСубСост=customer_subject_name,
    )

    add_doc_reference(
        doc,
        'ОснДоверОргСост',
        first_non_empty(manual.get('customerAuthorityDocName'), manual.get('customerSignerAuthorityDocName'), default='Доверенность / основание подписания заказчика'),
        first_non_empty(manual.get('customerAuthorityDocNumber'), manual.get('customerSignerAuthorityDocNumber'), common.get('contractNumber'), default='без номера'),
        first_non_empty(manual.get('customerAuthorityDocDate'), manual.get('customerSignerAuthorityDocDate'), common.get('contractDate')),
        inn=manual.get('customerInn'),
        doc_id=first_non_empty(manual.get('customerAuthorityDocId'), manual.get('customerSignerAuthorityDocId')),
        extra_info=first_non_empty(manual.get('customerAuthorityDocInfo'), manual.get('customerSignerAuthorityDocInfo')),
    )

    info_p = ET.SubElement(
        doc,
        'ИдИнфПодр',
        ИдФайлИнфПодр=contractor_file_id,
        ДатаФайлИнфПодр=contractor_file_date,
        ВремяФайлИнфПодр=contractor_file_time,
    )
    signatures = manual.get('contractorSignaturePayloads') or manual.get('contractorSignatures') or []
    if isinstance(signatures, list) and signatures:
        for signature in signatures:
            ET.SubElement(info_p, 'ЭП').text = str(signature)
    else:
        ET.SubElement(info_p, 'ЭП').text = str(first_non_empty(manual.get('contractorSignaturePayload'), default='placeholder-signature-base64'))

    posting_number = first_non_empty(ks3_doc.get('number'), first_doc.get('number'), default='без номера')
    posting_date = first_non_empty(ks3_doc.get('date'), first_doc.get('date'))
    content = ET.SubElement(
        doc,
        'СодФХЖ4',
        НомПостДок=posting_number,
        ДатаПостДок=fmt_date(posting_date),
        ВидОпер=build_operation_kind(common),
        ПрГосМун=constants.get('isGovMunicipal') or '0',
    )
    build_acceptance_block(content, data, manual, posting_date)
    add_settlement_notice(content, manual)

    for signer_data in build_customer_signers(common, manual):
        signer_block = ET.SubElement(doc, 'ПодписантЗак')
        attrs = {
            'СтатПодп': signer_data['status'],
            'ТипПодпис': signer_data['signatureType'],
            'Должн': signer_data['position'],
        }
        if signer_data.get('storageId'):
            attrs['ИдСистХран'] = signer_data['storageId']
        signer_parent = ET.SubElement(signer_block, 'Подписант', **attrs)
        family, name, patronymic = split_fio(signer_data['name'])
        fio = ET.SubElement(signer_parent, 'ФИО', Фамилия=family, Имя=name)
        if patronymic:
            fio.set('Отчество', patronymic)
        add_signer_authority(signer_parent, signer_data, manual)

    return ET.ElementTree(root)


def main():
    args = parse_args()
    data = load_json(Path(args.input_json))
    tree = build_customer_xml(data, Path(args.contractor_xml) if args.contractor_xml else None)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tree.write(str(output_path), encoding='windows-1251', xml_declaration=True, pretty_print=True)
    print(output_path)


if __name__ == '__main__':
    main()
