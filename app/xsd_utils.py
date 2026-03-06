from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional
from lxml import etree

NS = {"xs": "http://www.w3.org/2001/XMLSchema"}


@dataclass
class FieldDef:
    path: str
    kind: str  # element|attribute
    required: bool
    doc: str
    max_occurs: str = "1"

    @property
    def repeatable(self) -> bool:
        return self.kind == "element" and (self.max_occurs == "unbounded" or (self.max_occurs.isdigit() and int(self.max_occurs) > 1))


def _doc(node: etree._Element) -> str:
    d = node.xpath("./xs:annotation/xs:documentation", namespaces=NS)
    if not d:
        return ""
    return (d[0].text or "").strip()


def parse_xsd_fields(xsd_path: Path) -> List[FieldDef]:
    root = etree.parse(str(xsd_path)).getroot()
    complex_types: Dict[str, etree._Element] = {
        c.get("name"): c for c in root.xpath("./xs:complexType[@name]", namespaces=NS)
    }

    def resolve_complex_type(el: etree._Element) -> Optional[etree._Element]:
        t = el.get("type")
        if t:
            t = t.split(":", 1)[-1]
            if t in complex_types:
                return complex_types[t]
            return None
        inl = el.xpath("./xs:complexType", namespaces=NS)
        return inl[0] if inl else None

    out: List[FieldDef] = []

    def walk_element(el: etree._Element, path: str, min_occurs: str = "1", max_occurs: str = "1"):
        ctype = resolve_complex_type(el)
        if ctype is None:
            req = min_occurs != "0"
            out.append(FieldDef(path=path, kind="element", required=req, doc=_doc(el), max_occurs=max_occurs))
            return

        attrs = ctype.xpath("./xs:attribute", namespaces=NS)
        for a in attrs:
            out.append(
                FieldDef(
                    path=f"{path}/@{a.get('name')}",
                    kind="attribute",
                    required=(a.get("use") == "required"),
                    doc=_doc(a),
                )
            )

        children = ctype.xpath("./xs:sequence/xs:element", namespaces=NS)
        if not children:
            req = min_occurs != "0"
            out.append(FieldDef(path=path, kind="element", required=req, doc=_doc(el), max_occurs=max_occurs))
            return

        for ch in children:
            child_name = ch.get("name")
            if not child_name:
                continue
            walk_element(
                ch,
                f"{path}/{child_name}",
                min_occurs=ch.get("minOccurs") or "1",
                max_occurs=ch.get("maxOccurs") or "1",
            )

    root_el = root.xpath("./xs:element[@name='Файл']", namespaces=NS)[0]
    walk_element(root_el, "/Файл")
    return out


def build_xml_from_values(values: Dict[str, object]) -> etree._Element:
    root = etree.Element("Файл")

    def get_or_create(parent: etree._Element, tag: str) -> etree._Element:
        for c in parent:
            if c.tag == tag:
                return c
        c = etree.SubElement(parent, tag)
        return c

    for path, raw_value in sorted(values.items()):
        vals = raw_value if isinstance(raw_value, list) else [raw_value]
        for one in vals:
            value = (str(one) if one is not None else "").strip()
            if not value:
                continue
            parts = [p for p in path.split("/") if p]
            cur = root
            for i, part in enumerate(parts[1:], start=1):
                is_last = i == len(parts) - 1
                if part.startswith("@"):
                    cur.set(part[1:], value)
                else:
                    if is_last and len(vals) > 1:
                        cur = etree.SubElement(cur, part)
                    else:
                        cur = get_or_create(cur, part)
            if not parts[-1].startswith("@"):
                cur.text = value

    return root


def validate_xml(root_el: etree._Element, xsd_path: Path) -> list[str]:
    xsd_doc = etree.parse(str(xsd_path))
    schema = etree.XMLSchema(xsd_doc)
    xml_doc = etree.ElementTree(root_el)
    ok = schema.validate(xml_doc)
    if ok:
        return []
    return [str(e) for e in schema.error_log]
