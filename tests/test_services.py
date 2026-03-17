from app.models import DocumentHeader, FormPayload, KS2Sheet, RetentionItem, WorkItem
from app.services import calculate


def test_calculate_totals():
    payload = FormPayload(
        header=DocumentHeader(
            doc_number="1",
            doc_date="2026-03-17",
            contractor_name="ЛегендаЭлит",
            customer_name="Заказчик",
        ),
        ks2_sheets=[
            KS2Sheet(title="Лист 1", items=[WorkItem(name="A", quantity=2, price=100)]),
            KS2Sheet(title="Лист 2", items=[WorkItem(name="B", quantity=1, price=50)]),
        ],
        retentions=[RetentionItem(name="Гарантия", rate=10)],
    )

    result = calculate(payload)

    assert result.subtotal == 250
    assert result.retention_total == 25
    assert result.grand_total == 225
