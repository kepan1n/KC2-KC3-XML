from __future__ import annotations

import json
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, Request, UploadFile, File
from fastapi.responses import HTMLResponse, RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from .xsd_utils import parse_xsd_fields, build_xml_from_values, validate_xml
from .prefill import prefill_from_first_sheet

BASE_DIR = Path(__file__).resolve().parent.parent
XSD_PATH = BASE_DIR / "ON_AKTREZRABP.xsd"
DATA_DIR = BASE_DIR / "data"
OUT_DIR = BASE_DIR / "output"
STATE_FILE = DATA_DIR / "defaults.json"

DATA_DIR.mkdir(exist_ok=True)
OUT_DIR.mkdir(exist_ok=True)

app = FastAPI(title="KC2/KC3 XML Generator")
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "app" / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "app" / "templates"))

FIELDS = parse_xsd_fields(XSD_PATH)


def _group_key(path: str) -> str:
    p = [x for x in path.split('/') if x and not x.startswith('@')]
    if len(p) >= 3:
        return f"{p[1]} / {p[2]}"
    if len(p) >= 2:
        return p[1]
    return "Прочее"


def _grouped_fields():
    groups = {}
    for f in FIELDS:
        groups.setdefault(_group_key(f.path), []).append(f)
    return groups


def _find_sample_xlsx() -> Path | None:
    candidates = sorted(BASE_DIR.glob("*.xlsx"))
    return candidates[0] if candidates else None


def load_state() -> dict:
    if not STATE_FILE.exists():
        init_state = {"defaults": {}, "disabled": []}
        sample = _find_sample_xlsx()
        if sample:
            try:
                init_state["defaults"].update(prefill_from_first_sheet(sample))
            except Exception:
                pass
        return init_state
    return json.loads(STATE_FILE.read_text(encoding="utf-8"))


def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    state = load_state()
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "fields": FIELDS,
            "groups": _grouped_fields(),
            "defaults": state.get("defaults", {}),
            "disabled": set(state.get("disabled", [])),
            "result": None,
            "errors": [],
        },
    )


@app.post("/prefill", response_class=HTMLResponse)
async def prefill(request: Request, xlsx_file: UploadFile = File(...)):
    tmp = OUT_DIR / f"upload_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    tmp.write_bytes(await xlsx_file.read())

    state = load_state()
    auto = prefill_from_first_sheet(tmp)
    state_defaults = state.get("defaults", {})
    state_defaults.update(auto)
    state["defaults"] = state_defaults
    save_state(state)

    return RedirectResponse(url="/", status_code=303)


@app.post("/generate", response_class=HTMLResponse)
async def generate(request: Request):
    form = await request.form()

    values = {}
    disabled = []
    form_dict = dict(form)
    for f in FIELDS:
        key = f.path
        is_disabled = form.get(f"d::{key}") == "on"
        if is_disabled and not f.required:
            disabled.append(key)
            continue

        if f.repeatable:
            arr = []
            i = 0
            while True:
                k = f"v::{key}::{i}"
                if k not in form_dict:
                    break
                v = str(form.get(k, "")).strip()
                if v:
                    arr.append(v)
                i += 1
            if arr:
                values[key] = arr
        else:
            val = str(form.get(f"v::{key}", "")).strip()
            if val:
                values[key] = val

    # required check
    missing = [f.path for f in FIELDS if f.required and not values.get(f.path)]

    if missing:
        state = load_state()
        return templates.TemplateResponse(
            "index.html",
            {
                "request": request,
                "fields": FIELDS,
                "groups": _grouped_fields(),
                "defaults": {**state.get("defaults", {}), **values},
                "disabled": set(disabled),
                "result": None,
                "errors": [f"Не заполнено обязательное поле: {m}" for m in missing[:30]],
            },
        )

    root = build_xml_from_values(values)
    xml_path = OUT_DIR / f"on_aktrezrabp_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xml"
    xml_path.write_bytes(
        (
            b'<?xml version="1.0" encoding="windows-1251"?>\n'
            + __import__("lxml.etree").etree.tostring(root, encoding="windows-1251", pretty_print=True)
        )
    )

    errors = validate_xml(root, XSD_PATH)

    state = {
        "defaults": values,
        "disabled": disabled,
    }
    save_state(state)

    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "fields": FIELDS,
            "groups": _grouped_fields(),
            "defaults": values,
            "disabled": set(disabled),
            "result": {
                "file": xml_path.name,
                "valid": len(errors) == 0,
            },
            "errors": errors,
        },
    )


@app.get("/download/{name}")
async def download(name: str):
    p = OUT_DIR / name
    if not p.exists():
        return RedirectResponse("/")
    return FileResponse(str(p), filename=name, media_type="application/xml")
