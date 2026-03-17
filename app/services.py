from __future__ import annotations

from io import BytesIO

from lxml import etree
from openpyxl import Workbook

from .models import CalculationResult, FormPayload, SheetTotal


def calculate(payload: FormPayload) -> CalculationResult:
    sheet_totals: list[SheetTotal] = []
    subtotal = 0.0

    for sheet in payload.ks2_sheets:
        total = sum(item.quantity * item.price for item in sheet.items)
        sheet_totals.append(SheetTotal(title=sheet.title, total=round(total, 2)))
        subtotal += total

    retention_total = 0.0
    for retention in payload.retentions:
        retention_total += subtotal * (retention.rate / 100)

    grand_total = subtotal - retention_total

    return CalculationResult(
        sheets=sheet_totals,
        subtotal=round(subtotal, 2),
        retention_total=round(retention_total, 2),
        grand_total=round(grand_total, 2),
    )


def build_xml(payload: FormPayload) -> bytes:
    calc = calculate(payload)

    root = etree.Element("Document")
    header = etree.SubElement(root, "Header")
    etree.SubElement(header, "DocNumber").text = payload.header.doc_number
    etree.SubElement(header, "DocDate").text = payload.header.doc_date
    etree.SubElement(header, "ContractorName").text = payload.header.contractor_name
    etree.SubElement(header, "CustomerName").text = payload.header.customer_name

    sheets = etree.SubElement(root, "KS2Sheets")
    for sheet in payload.ks2_sheets:
        sheet_el = etree.SubElement(sheets, "Sheet", title=sheet.title)
        for item in sheet.items:
            item_el = etree.SubElement(sheet_el, "Item")
            etree.SubElement(item_el, "Name").text = item.name
            etree.SubElement(item_el, "Unit").text = item.unit
            etree.SubElement(item_el, "Quantity").text = str(item.quantity)
            etree.SubElement(item_el, "Price").text = str(item.price)
            etree.SubElement(item_el, "Sum").text = str(round(item.quantity * item.price, 2))

    retentions = etree.SubElement(root, "Retentions")
    for r in payload.retentions:
        retention_el = etree.SubElement(retentions, "Retention")
        etree.SubElement(retention_el, "Name").text = r.name
        etree.SubElement(retention_el, "Rate").text = str(r.rate)

    additional = etree.SubElement(root, "AdditionalXmlFields")
    for key, value in payload.additional_xml_fields.items():
        field_el = etree.SubElement(additional, "Field", key=key)
        field_el.text = value

    totals = etree.SubElement(root, "Totals")
    etree.SubElement(totals, "Subtotal").text = str(calc.subtotal)
    etree.SubElement(totals, "RetentionTotal").text = str(calc.retention_total)
    etree.SubElement(totals, "GrandTotal").text = str(calc.grand_total)

    return etree.tostring(root, pretty_print=True, encoding="utf-8", xml_declaration=True)


def build_xlsx(payload: FormPayload) -> bytes:
    calc = calculate(payload)
    wb = Workbook()
    ws = wb.active
    ws.title = "КС2-КС3"

    ws.append(["Номер документа", payload.header.doc_number])
    ws.append(["Дата", payload.header.doc_date])
    ws.append(["Подрядчик", payload.header.contractor_name])
    ws.append(["Заказчик", payload.header.customer_name])
    ws.append([])

    ws.append(["Лист", "Работа", "Ед.", "Кол-во", "Цена", "Сумма"])

    for sheet in payload.ks2_sheets:
        for item in sheet.items:
            ws.append(
                [
                    sheet.title,
                    item.name,
                    item.unit,
                    item.quantity,
                    item.price,
                    round(item.quantity * item.price, 2),
                ]
            )

    ws.append([])
    ws.append(["Итого", "", "", "", "", calc.subtotal])
    ws.append(["Удержания", "", "", "", "", calc.retention_total])
    ws.append(["К оплате", "", "", "", "", calc.grand_total])

    stream = BytesIO()
    wb.save(stream)
    return stream.getvalue()
