from __future__ import annotations

from pathlib import Path

from lxml import etree as ET


Z_XSD_NAME = 'ON_AKTREZRABZ.xsd'


def normalize_customer_z_time_attrs_for_xsd(document: ET._Element) -> ET._Element:
    doc = document.find('./Документ')
    info = document.find('./Документ/ИдИнфПодр')
    if doc is not None and doc.get('ВрИнфЗак'):
        doc.set('ВрИнфЗак', doc.get('ВрИнфЗак').replace(':', '.'))
    if info is not None and info.get('ВремяФайлИнфПодр'):
        info.set('ВремяФайлИнфПодр', info.get('ВремяФайлИнфПодр').replace(':', '.'))
    return document


def normalize_document_for_xsd(document: ET._Element, schema_path: Path | str) -> ET._Element:
    if Path(schema_path).name == Z_XSD_NAME:
        return normalize_customer_z_time_attrs_for_xsd(document)
    return document
