from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field


class WorkItem(BaseModel):
    name: str = Field(..., description="Наименование вида работ")
    unit: str = Field(default="шт")
    quantity: float = Field(default=0)
    price: float = Field(default=0)


class RetentionItem(BaseModel):
    name: str
    rate: float = Field(default=0, description="Процент удержания")


class KS2Sheet(BaseModel):
    title: str
    items: List[WorkItem] = Field(default_factory=list)


class DocumentHeader(BaseModel):
    doc_number: str
    doc_date: str
    contractor_name: str
    customer_name: str


class FormPayload(BaseModel):
    header: DocumentHeader
    ks2_sheets: List[KS2Sheet] = Field(default_factory=list)
    retentions: List[RetentionItem] = Field(default_factory=list)
    additional_xml_fields: dict[str, str] = Field(default_factory=dict)


class SheetTotal(BaseModel):
    title: str
    total: float


class CalculationResult(BaseModel):
    sheets: List[SheetTotal]
    subtotal: float
    retention_total: float
    grand_total: float
