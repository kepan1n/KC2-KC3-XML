#!/usr/bin/env python3
from __future__ import annotations

import io
import json
import sys
import zipfile
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from lxml import etree as ET

ROOT = Path(__file__).resolve().parents[1]
XSD_PATH = ROOT / 'nalog docs' / 'ON_AKTREZRABP_1_971_01_01_00_03.xsd'
FORMS_DIR = ROOT / 'saved-forms'

sys.path.insert(0, str(ROOT / 'scripts'))
from generate_xml_from_export import build_xml, build_xml_exports_by_ks2_sheet  # noqa: E402


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, directory=None, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path in ('', '/'):
            self.send_response(HTTPStatus.FOUND)
            self.send_header('Location', '/variants/modern-light/')
            self.end_headers()
            return
        if parsed.path == '/api/forms/list':
            return self.handle_list_forms()
        if parsed.path.startswith('/api/forms/load/'):
            return self.handle_load_form(parsed.path.removeprefix('/api/forms/load/'))
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/export-xml':
            return self.handle_export_xml()
        if parsed.path == '/api/forms/save':
            return self.handle_save_form()
        self.send_error(HTTPStatus.NOT_FOUND, 'Unknown API route')

    def _read_json(self):
        length = int(self.headers.get('Content-Length', '0'))
        raw = self.rfile.read(length)
        return json.loads(raw.decode('utf-8'))

    def handle_export_xml(self):
        try:
            payload = self._read_json()
        except Exception as exc:
            self._send_json({'ok': False, 'error': f'Invalid JSON payload: {exc}'}, status=HTTPStatus.BAD_REQUEST)
            return

        try:
            schema = ET.XMLSchema(ET.parse(str(XSD_PATH)))
            exports = build_xml_exports_by_ks2_sheet(payload)

            if len(exports) == 1:
                item = exports[0]
                xml_bytes = ET.tostring(item['tree'], encoding='windows-1251', xml_declaration=True, pretty_print=True)
                xml_doc = ET.fromstring(xml_bytes)
                valid = schema.validate(xml_doc)
                if not valid:
                    errors = [{'line': err.line, 'message': err.message} for err in schema.error_log]
                    self._send_json({'ok': False, 'valid': False, 'errors': errors}, status=HTTPStatus.UNPROCESSABLE_ENTITY)
                    return

                self.send_response(HTTPStatus.OK)
                self.send_header('Content-Type', 'application/xml; charset=windows-1251')
                self.send_header('Content-Disposition', f'attachment; filename="{item["filename"]}"')
                self.send_header('Content-Length', str(len(xml_bytes)))
                self.end_headers()
                self.wfile.write(xml_bytes)
                return

            archive_buffer = io.BytesIO()
            archive_name = f"{payload.get('xml', {}).get('generated', {}).get('fileId', 'generated_1110335')}-per-ks2.zip"
            collected_errors = []
            with zipfile.ZipFile(archive_buffer, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
                for item in exports:
                    xml_bytes = ET.tostring(item['tree'], encoding='windows-1251', xml_declaration=True, pretty_print=True)
                    xml_doc = ET.fromstring(xml_bytes)
                    valid = schema.validate(xml_doc)
                    if not valid:
                        collected_errors.append({
                            'sheetIndex': item['sheetIndex'],
                            'sheetTitle': item['sheetTitle'],
                            'errors': [{'line': err.line, 'message': err.message} for err in schema.error_log],
                        })
                        schema = ET.XMLSchema(ET.parse(str(XSD_PATH)))
                        continue
                    archive.writestr(item['filename'], xml_bytes)
                    schema = ET.XMLSchema(ET.parse(str(XSD_PATH)))

            if collected_errors:
                self._send_json({'ok': False, 'valid': False, 'sheetErrors': collected_errors}, status=HTTPStatus.UNPROCESSABLE_ENTITY)
                return

            archive_bytes = archive_buffer.getvalue()
            self.send_response(HTTPStatus.OK)
            self.send_header('Content-Type', 'application/zip')
            self.send_header('Content-Disposition', f'attachment; filename="{archive_name}"')
            self.send_header('Content-Length', str(len(archive_bytes)))
            self.end_headers()
            self.wfile.write(archive_bytes)
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

    def handle_save_form(self):
        try:
            payload = self._read_json()
            name = str(payload.get('name', '')).strip()
            state = payload.get('state')
            if not name:
                raise ValueError('Missing save name')
            if state is None:
                raise ValueError('Missing state payload')
            safe_name = ''.join(ch if ch.isalnum() or ch in ('-', '_', '.') else '-' for ch in name).strip('-') or 'form'
            FORMS_DIR.mkdir(parents=True, exist_ok=True)
            path = FORMS_DIR / f'{safe_name}.json'
            path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
            self._send_json({'ok': True, 'name': safe_name, 'path': str(path.relative_to(ROOT))})
        except Exception as exc:
            self._send_json({'ok': False, 'error': str(exc)}, status=HTTPStatus.BAD_REQUEST)

    def handle_list_forms(self):
        FORMS_DIR.mkdir(parents=True, exist_ok=True)
        items = []
        for path in sorted(FORMS_DIR.glob('*.json')):
            stat = path.stat()
            items.append({'name': path.stem, 'file': path.name, 'updatedAt': int(stat.st_mtime), 'size': stat.st_size})
        self._send_json({'ok': True, 'items': items})

    def handle_load_form(self, name):
        safe_name = ''.join(ch if ch.isalnum() or ch in ('-', '_', '.') else '-' for ch in name).strip('-')
        path = FORMS_DIR / f'{safe_name}.json'
        if not path.exists():
            self._send_json({'ok': False, 'error': 'Saved form not found'}, status=HTTPStatus.NOT_FOUND)
            return
        state = json.loads(path.read_text(encoding='utf-8'))
        self._send_json({'ok': True, 'name': safe_name, 'state': state})

    def _send_json(self, data, status=HTTPStatus.OK):
        body = json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    server = ThreadingHTTPServer(('0.0.0.0', port), AppHandler)
    print(f'Serving KC2-KC3-XML on http://0.0.0.0:{port}')
    print(f'Open locally: http://127.0.0.1:{port}/variants/modern-light/')
    print('API: POST /api/export-xml -> validate against XSD and return XML only if valid')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
