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
XSD_Z_PATH = ROOT / 'nalog docs' / 'ON_AKTREZRABZ.xsd'
FORMS_DIR = ROOT / 'saved-forms'

sys.path.insert(0, str(ROOT / 'scripts'))
from generate_customer_xml_from_export import build_customer_xml_exports_by_ks2_sheet  # noqa: E402
from generate_xml_from_export import build_xml_exports_by_ks2_sheet  # noqa: E402
from split_legacy_multi_sheet_form import save_split_forms, split_state_into_single_sheet_forms  # noqa: E402


def serialize_xml_tree(tree: ET._ElementTree) -> bytes:
    return ET.tostring(tree, encoding='windows-1251', xml_declaration=True, pretty_print=True)


def validate_xml_bytes(xml_bytes: bytes, schema_path: Path):
    schema = ET.XMLSchema(ET.parse(str(schema_path)))
    xml_doc = ET.fromstring(xml_bytes)
    valid = schema.validate(xml_doc)
    errors = [{'line': err.line, 'message': err.message} for err in schema.error_log] if not valid else []
    return valid, errors


def validate_xml_exports(exports, schema_path: Path, kind: str):
    ready = []
    errors = []
    for item in exports:
        xml_bytes = serialize_xml_tree(item['tree'])
        valid, item_errors = validate_xml_bytes(xml_bytes, schema_path)
        if not valid:
            errors.append({
                'kind': kind,
                'sheetIndex': item['sheetIndex'],
                'sheetTitle': item['sheetTitle'],
                'filename': item['filename'],
                'errors': item_errors,
            })
            continue
        ready.append({**item, 'xmlBytes': xml_bytes})
    return ready, errors


def parse_validation_exception(exc: Exception):
    text = str(exc)
    try:
        data = json.loads(text)
        if isinstance(data, dict) and 'validationErrors' in data:
            return data['validationErrors']
    except Exception:
        pass
    return None


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
        if parsed.path == '/api/export-customer-xml':
            return self.handle_export_customer_xml()
        if parsed.path == '/api/export-xml-bundle':
            return self.handle_export_xml_bundle()
        if parsed.path == '/api/preview-xml-sheet':
            return self.handle_preview_xml_sheet()
        if parsed.path == '/api/preview-customer-xml-sheet':
            return self.handle_preview_customer_xml_sheet()
        if parsed.path == '/api/forms/save':
            return self.handle_save_form()
        if parsed.path == '/api/forms/split-single-sheet':
            return self.handle_split_single_sheet_form()
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
            exports = build_xml_exports_by_ks2_sheet(payload)
            ready_exports, collected_errors = validate_xml_exports(exports, XSD_PATH, 'contractor')
            if collected_errors:
                self._send_json({'ok': False, 'valid': False, 'sheetErrors': collected_errors}, status=HTTPStatus.UNPROCESSABLE_ENTITY)
                return

            if len(ready_exports) == 1:
                item = ready_exports[0]
                self.send_response(HTTPStatus.OK)
                self.send_header('Content-Type', 'application/xml; charset=windows-1251')
                self.send_header('Content-Disposition', f'attachment; filename="{item["filename"]}"')
                self.send_header('Content-Length', str(len(item['xmlBytes'])))
                self.end_headers()
                self.wfile.write(item['xmlBytes'])
                return

            archive_buffer = io.BytesIO()
            archive_name = f"{payload.get('xml', {}).get('generated', {}).get('fileId', 'generated_1110335')}-per-ks2.zip"
            with zipfile.ZipFile(archive_buffer, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
                for item in ready_exports:
                    archive.writestr(item['filename'], item['xmlBytes'])

            archive_bytes = archive_buffer.getvalue()
            self.send_response(HTTPStatus.OK)
            self.send_header('Content-Type', 'application/zip')
            self.send_header('Content-Disposition', f'attachment; filename="{archive_name}"')
            self.send_header('Content-Length', str(len(archive_bytes)))
            self.end_headers()
            self.wfile.write(archive_bytes)
        except Exception as exc:
            validation_errors = parse_validation_exception(exc)
            if validation_errors is not None:
                self._send_json({'ok': False, 'valid': False, 'validationErrors': validation_errors}, status=HTTPStatus.UNPROCESSABLE_ENTITY)
                return
            self._send_json({'ok': False, 'error': str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def handle_export_customer_xml(self):
        try:
            payload = self._read_json()
        except Exception as exc:
            self._send_json({'ok': False, 'error': f'Invalid JSON payload: {exc}'}, status=HTTPStatus.BAD_REQUEST)
            return

        try:
            exports = build_customer_xml_exports_by_ks2_sheet(payload)
            ready_exports, collected_errors = validate_xml_exports(exports, XSD_Z_PATH, 'customer')
            if collected_errors:
                self._send_json({'ok': False, 'valid': False, 'sheetErrors': collected_errors}, status=HTTPStatus.UNPROCESSABLE_ENTITY)
                return

            if len(ready_exports) == 1:
                item = ready_exports[0]
                self.send_response(HTTPStatus.OK)
                self.send_header('Content-Type', 'application/xml; charset=windows-1251')
                self.send_header('Content-Disposition', f'attachment; filename="{item["filename"]}"')
                self.send_header('Content-Length', str(len(item['xmlBytes'])))
                self.end_headers()
                self.wfile.write(item['xmlBytes'])
                return

            archive_buffer = io.BytesIO()
            archive_name = f"{payload.get('xml', {}).get('generated', {}).get('fileId', 'generated_1110336')}-customer-per-ks2.zip"
            with zipfile.ZipFile(archive_buffer, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
                for item in ready_exports:
                    archive.writestr(item['filename'], item['xmlBytes'])

            archive_bytes = archive_buffer.getvalue()
            self.send_response(HTTPStatus.OK)
            self.send_header('Content-Type', 'application/zip')
            self.send_header('Content-Disposition', f'attachment; filename="{archive_name}"')
            self.send_header('Content-Length', str(len(archive_bytes)))
            self.end_headers()
            self.wfile.write(archive_bytes)
        except Exception as exc:
            validation_errors = parse_validation_exception(exc)
            if validation_errors is not None:
                self._send_json({'ok': False, 'valid': False, 'validationErrors': validation_errors}, status=HTTPStatus.UNPROCESSABLE_ENTITY)
                return
            self._send_json({'ok': False, 'error': str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def handle_export_xml_bundle(self):
        try:
            payload = self._read_json()
        except Exception as exc:
            self._send_json({'ok': False, 'error': f'Invalid JSON payload: {exc}'}, status=HTTPStatus.BAD_REQUEST)
            return

        try:
            contractor_exports, contractor_errors = validate_xml_exports(build_xml_exports_by_ks2_sheet(payload), XSD_PATH, 'contractor')
            customer_exports, customer_errors = validate_xml_exports(build_customer_xml_exports_by_ks2_sheet(payload), XSD_Z_PATH, 'customer')
            if contractor_errors or customer_errors:
                self._send_json({
                    'ok': False,
                    'valid': False,
                    'contractorSheetErrors': contractor_errors,
                    'customerSheetErrors': customer_errors,
                }, status=HTTPStatus.UNPROCESSABLE_ENTITY)
                return

            archive_buffer = io.BytesIO()
            archive_name = f"{payload.get('xml', {}).get('generated', {}).get('fileId', 'generated_1110335')}{'-p-z.zip' if len(contractor_exports) == 1 and len(customer_exports) == 1 else '-p-z-per-ks2.zip'}"
            with zipfile.ZipFile(archive_buffer, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
                for item in contractor_exports:
                    archive.writestr(f"contractor/{item['filename']}", item['xmlBytes'])
                for item in customer_exports:
                    archive.writestr(f"customer/{item['filename']}", item['xmlBytes'])

            archive_bytes = archive_buffer.getvalue()
            self.send_response(HTTPStatus.OK)
            self.send_header('Content-Type', 'application/zip')
            self.send_header('Content-Disposition', f'attachment; filename="{archive_name}"')
            self.send_header('Content-Length', str(len(archive_bytes)))
            self.end_headers()
            self.wfile.write(archive_bytes)
        except Exception as exc:
            validation_errors = parse_validation_exception(exc)
            if validation_errors is not None:
                self._send_json({'ok': False, 'valid': False, 'validationErrors': validation_errors}, status=HTTPStatus.UNPROCESSABLE_ENTITY)
                return
            self._send_json({'ok': False, 'error': str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def handle_preview_xml_sheet(self):
        try:
            payload = self._read_json()
        except Exception as exc:
            self._send_json({'ok': False, 'error': f'Invalid JSON payload: {exc}'}, status=HTTPStatus.BAD_REQUEST)
            return

        try:
            requested_sheet_index = int(payload.get('sheetIndex', 0))
            model = payload.get('model') or payload
            exports = build_xml_exports_by_ks2_sheet(model)
            item = next((entry for entry in exports if int(entry.get('sheetIndex', -1)) == requested_sheet_index), None)
            if item is None:
                raise ValueError(f'KS2 sheet not found: {requested_sheet_index}')

            xml_bytes = serialize_xml_tree(item['tree'])
            valid, errors = validate_xml_bytes(xml_bytes, XSD_PATH)
            self._send_json({
                'ok': True,
                'sheetIndex': item['sheetIndex'],
                'sheetTitle': item['sheetTitle'],
                'filename': item['filename'],
                'valid': valid,
                'errors': errors,
                'xmlText': xml_bytes.decode('cp1251', errors='replace'),
            })
        except Exception as exc:
            validation_errors = parse_validation_exception(exc)
            if validation_errors is not None:
                self._send_json({'ok': False, 'validationErrors': validation_errors}, status=HTTPStatus.BAD_REQUEST)
                return
            self._send_json({'ok': False, 'error': str(exc)}, status=HTTPStatus.BAD_REQUEST)

    def handle_preview_customer_xml_sheet(self):
        try:
            payload = self._read_json()
        except Exception as exc:
            self._send_json({'ok': False, 'error': f'Invalid JSON payload: {exc}'}, status=HTTPStatus.BAD_REQUEST)
            return

        try:
            requested_sheet_index = int(payload.get('sheetIndex', 0))
            model = payload.get('model') or payload
            exports = build_customer_xml_exports_by_ks2_sheet(model)
            item = next((entry for entry in exports if int(entry.get('sheetIndex', -1)) == requested_sheet_index), None)
            if item is None:
                raise ValueError(f'KS2 sheet not found: {requested_sheet_index}')

            xml_bytes = serialize_xml_tree(item['tree'])
            valid, errors = validate_xml_bytes(xml_bytes, XSD_Z_PATH)
            self._send_json({
                'ok': True,
                'sheetIndex': item['sheetIndex'],
                'sheetTitle': item['sheetTitle'],
                'filename': item['filename'],
                'contractorFileId': item.get('contractorFileId'),
                'valid': valid,
                'errors': errors,
                'xmlText': xml_bytes.decode('cp1251', errors='replace'),
            })
        except Exception as exc:
            validation_errors = parse_validation_exception(exc)
            if validation_errors is not None:
                self._send_json({'ok': False, 'validationErrors': validation_errors}, status=HTTPStatus.BAD_REQUEST)
                return
            self._send_json({'ok': False, 'error': str(exc)}, status=HTTPStatus.BAD_REQUEST)

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

    def handle_split_single_sheet_form(self):
        try:
            payload = self._read_json()
            name = str(payload.get('name', '')).strip() or 'split-form'
            state = payload.get('state')
            if state is None:
                raise ValueError('Missing state payload')
            forms = split_state_into_single_sheet_forms(state)
            output_dir = FORMS_DIR / 'split-single-sheet'
            saved_items = save_split_forms(forms, output_dir, name)
            relative_items = [{**item, 'path': str(Path(item['path']).relative_to(ROOT))} for item in saved_items]
            self._send_json({'ok': True, 'count': len(relative_items), 'items': relative_items})
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
    print('API: POST /api/export-xml -> contractor XML / ZIP (1110335)')
    print('API: POST /api/export-customer-xml -> customer XML / ZIP (1110336)')
    print('API: POST /api/export-xml-bundle -> paired P+Z ZIP by KS2 sheet')
    print('API: POST /api/forms/split-single-sheet -> split legacy multi-sheet form into single-sheet JSON files')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
