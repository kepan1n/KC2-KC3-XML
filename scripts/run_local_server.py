#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from lxml import etree as ET

ROOT = Path(__file__).resolve().parents[1]
XSD_PATH = ROOT / 'nalog docs' / 'ON_AKTREZRABP_1_971_01_01_00_03.xsd'

sys.path.insert(0, str(ROOT / 'scripts'))
from generate_xml_from_export import build_xml  # noqa: E402


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, directory=None, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != '/api/export-xml':
            self.send_error(HTTPStatus.NOT_FOUND, 'Unknown API route')
            return

        try:
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length)
            payload = json.loads(raw.decode('utf-8'))
        except Exception as exc:
            self._send_json({'ok': False, 'error': f'Invalid JSON payload: {exc}'}, status=HTTPStatus.BAD_REQUEST)
            return

        try:
            tree = build_xml(payload)
            xml_bytes = ET.tostring(tree, encoding='windows-1251', xml_declaration=True, pretty_print=True)
            schema = ET.XMLSchema(ET.parse(str(XSD_PATH)))
            xml_doc = ET.fromstring(xml_bytes)
            valid = schema.validate(xml_doc)
            if not valid:
                errors = [{'line': err.line, 'message': err.message} for err in schema.error_log]
                self._send_json({'ok': False, 'valid': False, 'errors': errors}, status=HTTPStatus.UNPROCESSABLE_ENTITY)
                return

            filename = f"{payload.get('xml', {}).get('generated', {}).get('fileId', 'generated_1110335')}.xml"
            self.send_response(HTTPStatus.OK)
            self.send_header('Content-Type', 'application/xml; charset=windows-1251')
            self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
            self.send_header('Content-Length', str(len(xml_bytes)))
            self.end_headers()
            self.wfile.write(xml_bytes)
        except Exception as exc:
            text = str(exc)
            try:
                data = json.loads(text)
                if isinstance(data, dict) and 'validationErrors' in data:
                    self._send_json({'ok': False, 'valid': False, 'validationErrors': data['validationErrors']}, status=HTTPStatus.UNPROCESSABLE_ENTITY)
                    return
            except Exception:
                pass
            self._send_json({'ok': False, 'error': text}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def _send_json(self, data, status=HTTPStatus.OK):
        body = json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    server = ThreadingHTTPServer(('127.0.0.1', port), AppHandler)
    print(f'Serving KC2-KC3-XML on http://127.0.0.1:{port}')
    print('API: POST /api/export-xml -> validate against XSD and return XML only if valid')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
