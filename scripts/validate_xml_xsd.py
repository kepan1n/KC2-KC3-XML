#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
from lxml import etree as ET

from z_xsd_compat import normalize_document_for_xsd

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_XSD = ROOT / 'nalog docs' / 'ON_AKTREZRABP_1_971_01_01_00_03.xsd'


def parse_args():
    parser = argparse.ArgumentParser(description='Validate XML against XSD 1110335')
    parser.add_argument('xml_path', help='Path to XML file')
    parser.add_argument('--xsd', default=str(DEFAULT_XSD), help='Path to XSD schema')
    return parser.parse_args()


def main():
    args = parse_args()
    xml_path = Path(args.xml_path)
    xsd_path = Path(args.xsd)

    schema_doc = ET.parse(str(xsd_path))
    schema = ET.XMLSchema(schema_doc)
    xml_doc = ET.parse(str(xml_path))
    normalize_document_for_xsd(xml_doc.getroot(), xsd_path)

    is_valid = schema.validate(xml_doc)
    print('VALID' if is_valid else 'INVALID')
    if not is_valid:
        for error in schema.error_log:
            print(f'line {error.line}: {error.message}')
        raise SystemExit(1)


if __name__ == '__main__':
    main()
