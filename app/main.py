from __future__ import annotations

import json
import re
import difflib
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, Request, UploadFile, File, Form
from fastapi.responses import HTMLResponse, RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from .xsd_utils import parse_xsd_fields, build_xml_from_values, validate_xml
from .prefill import prefill_from_first_sheet
from .help_texts import build_embedded_hints
from .human_form import HUMAN_CARDS

BASE_DIR = Path(__file__).resolve().parent.parent
XSD_PATH = BASE_DIR / "nalog docs" / "ON_AKTREZRABP_1_971_01_01_00_03.xsd"
DATA_DIR = BASE_DIR / "data"
OUT_DIR = BASE_DIR / "output"
STATE_FILE = DATA_DIR / "defaults.json"
PROFILES_DIR = DATA_DIR / "profiles"

DATA_DIR.mkdir(exist_ok=True)
OUT_DIR.mkdir(exist_ok=True)
PROFILES_DIR.mkdir(exist_ok=True)

app = FastAPI(title="KC2/KC3 XML Generator")
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "app" / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "app" / "templates"))

FIELDS = parse_xsd_fields(XSD_PATH)
FIELDS_BY_PATH = {f.path: f for f in FIELDS}
FIELD_HINTS = build_embedded_hints(
    [f.path for f in FIELDS],
    xsd_docs={f.path: (f.doc or "") for f in FIELDS},
)
DOC_FALLBACK = "Подсказка встроена в приложение и не зависит от чтения DOCX во время работы."

ID_BUILDER_DEFAULTS = {
    "id_op_pol": "000",
    "code_pol": "0000000000",
    "id_op_otpr": "000",
    "code_otpr": "0000000000",
}

SYSTEM_LOCKED_PATHS = {
    "/Файл/@ИдФайл",
    "/Файл/@ВерсФорм",
    "/Файл/Документ/@КНД",
}

MANUAL_SETTING_PATHS = [
    "/Файл/Документ/НастрФормДок/@ПрНДСВИтог",
    "/Файл/Документ/НастрФормДок/@ПрНакИтог",
    "/Файл/Документ/НастрФормДок/@ПрИндЦен",
    "/Файл/Документ/НастрФормДок/@ПрСведРасчСогл",
    "/Файл/Документ/НастрФормДок/@СтепАгрег",
]


def _group_key(path: str) -> str:
    p = [x for x in path.split('/') if x and not x.startswith('@')]
    if len(p) >= 3:
        return f"{p[1]} / {p[2]}"
    if len(p) >= 2:
        return p[1]
    return "Прочее"


def _grouped_fields(minimal_only: bool = False):
    groups = {}
    items = [f for f in FIELDS if f.path not in SYSTEM_LOCKED_PATHS and (f.required if minimal_only else True)]
    for f in items:
        groups.setdefault(_group_key(f.path), []).append(f)
    return groups


def _find_sample_xlsx() -> Path | None:
    candidates = sorted(BASE_DIR.glob("*.xlsx"))
    return candidates[0] if candidates else None


def _profile_names() -> list[str]:
    return sorted([p.stem for p in PROFILES_DIR.glob("*.json")])


def load_state() -> dict:
    if not STATE_FILE.exists():
        init_state = {"defaults": {}, "disabled": [], "id_builder": dict(ID_BUILDER_DEFAULTS)}
        sample = _find_sample_xlsx()
        if sample:
            try:
                init_state["defaults"].update(prefill_from_first_sheet(sample))
            except Exception:
                pass
        return init_state
    st = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    if "id_builder" not in st:
        st["id_builder"] = dict(ID_BUILDER_DEFAULTS)
    return st


def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def _is_valid_inn(v: str) -> bool:
    return bool(re.fullmatch(r"\d{10}|\d{12}", v))


def _is_valid_kpp(v: str) -> bool:
    return bool(re.fullmatch(r"\d{9}", v))


def _validate_id_builder(id_builder: dict) -> list[str]:
    errs: list[str] = []
    checks = [
        ("id_op_pol", r"\d{3}", "ИдОперПол должен быть ровно 3 цифры"),
        ("code_pol", r"\d{10}", "КодПол должен быть ровно 10 цифр"),
        ("id_op_otpr", r"\d{3}", "ИдОперОтпр должен быть ровно 3 цифры"),
        ("code_otpr", r"\d{10}", "КодОтпр должен быть ровно 10 цифр"),
    ]
    for key, pattern, msg in checks:
        v = str(id_builder.get(key, "")).strip()
        if not re.fullmatch(pattern, v):
            errs.append(msg)
    return errs


def _autogen_file_id(id_builder: dict) -> str:
    d = datetime.now().strftime("%Y%m%d")
    guid = datetime.now().strftime("%H%M%S%f")
    a = f"{id_builder.get('id_op_pol','000')}{id_builder.get('code_pol','0000000000')}"
    o = f"{id_builder.get('id_op_otpr','000')}{id_builder.get('code_otpr','0000000000')}"
    return f"ON_AKTREZRABP_{a}_{o}_{d}_{guid}"


def _is_valid_file_id(file_id: str) -> bool:
    return bool(re.fullmatch(r"ON_AKTREZRABP_\d{13}_\d{13}_\d{8}_[A-Za-z0-9]{6,}", file_id or ""))


def _latest_xml_file(exclude_name: str | None = None) -> Path | None:
    files = sorted(OUT_DIR.glob("*.xml"), key=lambda p: p.stat().st_mtime, reverse=True)
    for p in files:
        if exclude_name and p.name == exclude_name:
            continue
        return p
    return None


def _xml_text_for_diff(path: Path) -> list[str]:
    try:
        txt = path.read_text(encoding="windows-1251", errors="ignore")
    except Exception:
        txt = path.read_text(encoding="utf-8", errors="ignore")
    return txt.splitlines()


def _field_validation_errors(values: dict) -> list[str]:
    errs: list[str] = []
    for path, val in values.items():
        f = FIELDS_BY_PATH.get(path)
        if not f:
            continue
        vals = val if isinstance(val, list) else [val]
        for one in vals:
            s = str(one)
            if f.max_length and len(s) > int(f.max_length):
                errs.append(f"{path}: длина {len(s)} больше maxLength={f.max_length}")
            if f.pattern and not re.fullmatch(f.pattern, s):
                errs.append(f"{path}: не соответствует формату (pattern)")
            if f.enum_values and s not in f.enum_values:
                errs.append(f"{path}: значение не из справочника")
            if "ИНН" in path and s and not _is_valid_inn(s):
                errs.append(f"{path}: некорректный ИНН")
            if "КПП" in path and s and not _is_valid_kpp(s):
                errs.append(f"{path}: некорректный КПП")
    return errs


def _now_date() -> str:
    return datetime.now().strftime("%d.%m.%Y")


def _now_time() -> str:
    return datetime.now().strftime("%H.%M.%S")


OPTIONAL_BRANCH_PREFIXES = [
    "/Файл/Документ/СвАктСдПр/ИспрАктСдПр",
    "/Файл/Документ/СвАктСдПр/ИнфПолФХЖ1",
    "/Файл/Документ/СвПродПер/ИнфПолФХЖ3",
    "/Файл/Документ/ПодписантПодр/Подписант/СвДоверБум",
]


def _is_branch_activated(values: dict, prefix: str) -> bool:
    return any(k.startswith(prefix) and str(v).strip() for k, v in values.items())


def _effective_required_paths(values: dict) -> list[str]:
    req: list[str] = []
    for f in FIELDS:
        if not f.required:
            continue
        skip = False
        for pref in OPTIONAL_BRANCH_PREFIXES:
            if f.path.startswith(pref) and not _is_branch_activated(values, pref):
                skip = True
                break
        if not skip:
            req.append(f.path)
    return req


def _conditional_required(values: dict) -> list[tuple[str, str]]:
    req: list[tuple[str, str]] = []

    pr_nds = values.get("/Файл/Документ/НастрФормДок/@ПрНДСВИтог")
    pr_nak = values.get("/Файл/Документ/НастрФормДок/@ПрНакИтог")
    pr_ras = values.get("/Файл/Документ/НастрФормДок/@ПрСведРасчСогл")
    kod_okv = values.get("/Файл/Документ/СвАктСдПр/ДенИзм/@КодОКВ")

    # Якорные поля ключевых разделов верхнего уровня документа
    req.extend([
        ("/Файл/Документ/СвАктСдПр/@НомерДок", "Требуется базовый блок СвАктСдПр"),
        ("/Файл/Документ/СвПродПер/СвПер/@СодОпер", "Требуется блок СвПродПер (содержание операции)"),
        ("/Файл/Документ/ВсегоАктОтч/@СтТовБезНДСВсего", "Требуется блок итогов ВсегоАктОтч"),
        ("/Файл/Документ/ПодписантПодр/Подписант/ФИО/@Фамилия", "Требуется блок подписанта подрядчика"),
        ("/Файл/Документ/ПодписантПодр/Подписант/ФИО/@Имя", "Требуется блок подписанта подрядчика"),
    ])

    if pr_ras == "1":
        req.extend([
            ("/Файл/Документ/СвОРасч/@СумУдержВсегоОтч", "ПрСведРасчСогл=1: требуется раздел СвОРасч (сумма удержаний за отчетный период)"),
            ("/Файл/Документ/СвОРасч/@СумТребВсегоОтч", "ПрСведРасчСогл=1: требуется раздел СвОРасч (сумма требований за отчетный период)"),
            ("/Файл/Документ/СвОРасч/@ВсегоКОплатОтч", "ПрСведРасчСогл=1: требуется итог к оплате за отчетный период"),
        ])

    has_vidrab = any(k.startswith("/Файл/Документ/НаимИСт/ВидРаб") and str(v).strip() for k, v in values.items())
    if has_vidrab:
        req.extend([
            ("/Файл/Документ/НаимИСт/ВидРаб/@ТипЗатр", "Для режима ВидРаб требуется ТипЗатр"),
            ("/Файл/Документ/НаимИСт/ВидРаб/@ОКЕИ_Стройка", "Для режима ВидРаб требуется ОКЕИ_Стройка"),
            ("/Файл/Документ/НаимИСт/ВидРаб/@НаимЕдИзм", "Для режима ВидРаб требуется НаимЕдИзм"),
        ])

    if pr_nak in {"1", "2"}:
        req.extend([
            ("/Файл/Документ/ВсегоАктСНач/@СтТовБезНДСВсего", "ПрНакИтог=1/2: обязателен блок итогов с начала строительства"),
        ])

    if pr_nds == "1":
        req.extend([
            ("/Файл/Документ/ВсегоАктОтч/@СтТовУчНалВсего", "ПрНДСВИтог=1: требуется итоговая стоимость с налогом"),
            ("/Файл/Документ/ВсегоАктОтч/СумПоСтавке/@НалСт", "ПрНДСВИтог=1: требуется детализация по ставке НДС"),
            ("/Файл/Документ/ВсегоАктОтч/СумПоСтавке/@НалБаза", "ПрНДСВИтог=1: требуется налоговая база по ставке"),
        ])

    if kod_okv and kod_okv != "643":
        req.extend([
            ("/Файл/Документ/ВсегоАктОтч/@СтУчНалВсВалДог", "Валюта договора не 643: требуется итог в валюте договора"),
            ("/Файл/Документ/ВсегоАктОтч/@СумНалВсВалДог", "Валюта договора не 643: требуется сумма налога в валюте договора"),
        ])
        if pr_nak in {"1", "2"}:
            req.extend([
                ("/Файл/Документ/ВсегоАктСНач/@СтУчНалВсВалДог", "Валюта договора не 643 + ПрНакИтог: требуется итог в валюте с начала строительства"),
                ("/Файл/Документ/ВсегоАктСНач/@СумНалВсВалДог", "Валюта договора не 643 + ПрНакИтог: требуется сумма налога в валюте с начала строительства"),
            ])

    return req


def _impossible_combinations(values: dict) -> list[str]:
    errs: list[str] = []

    pr_nds = values.get("/Файл/Документ/НастрФормДок/@ПрНДСВИтог")
    pr_nak = values.get("/Файл/Документ/НастрФормДок/@ПрНакИтог")
    pr_ras = values.get("/Файл/Документ/НастрФормДок/@ПрСведРасчСогл")
    pr_gos = values.get("/Файл/Документ/СвАктСдПр/ОсновСтроит/@ПрГосМун")

    naim_touched = any(k.startswith("/Файл/Документ/НаимИСт/") and str(v).strip() for k, v in values.items())
    has_vidrab = any(k.startswith("/Файл/Документ/НаимИСт/ВидРаб") and str(v).strip() for k, v in values.items())
    has_razdel = any(k.startswith("/Файл/Документ/НаимИСт/Раздел") and str(v).strip() for k, v in values.items())
    has_rasres = any(k.startswith("/Файл/Документ/НаимИСт/РасшифРес") and str(v).strip() for k, v in values.items())

    if pr_nds and pr_nds not in {"0", "1"}:
        errs.append("ПрНДСВИтог допускает только 0 или 1")
    if pr_nak and pr_nak not in {"0", "1", "2"}:
        errs.append("ПрНакИтог допускает только 0, 1 или 2")
    if pr_ras and pr_ras not in {"0", "1"}:
        errs.append("ПрСведРасчСогл допускает только 0 или 1")

    if naim_touched and has_rasres and (has_vidrab or has_razdel):
        errs.append("НаимИСт: при наличии РасшифРес элементы ВидРаб и Раздел должны отсутствовать")

    if naim_touched and (not has_rasres) and (not has_vidrab) and (not has_razdel):
        errs.append("НаимИСт: при отсутствии РасшифРес должен быть заполнен хотя бы один из элементов ВидРаб или Раздел")

    okei_stroyka = str(values.get("/Файл/Документ/НаимИСт/ВидРаб/@ОКЕИ_Стройка", "")).strip()
    naim_ed = str(values.get("/Файл/Документ/НаимИСт/ВидРаб/@НаимЕдИзм", "")).strip()
    if okei_stroyka == "0000" and not naim_ed:
        errs.append("ВидРаб: при ОКЕИ_Стройка=0000 обязательно заполнить НаимЕдИзм")
    if pr_gos == "1" and okei_stroyka == "0000":
        errs.append("ВидРаб: при ПрГосМун=1 код ОКЕИ_Стройка=0000 недопустим")

    has_sum_nds_total = bool(str(values.get("/Файл/Документ/ВсегоАктОтч/СумНалВсего", "")).strip())
    has_nds_percent = bool(str(values.get("/Файл/Документ/ВсегоАктОтч/ОтсСумНДС", "")).strip())
    has_sum_by_rate = any(k.startswith("/Файл/Документ/ВсегоАктОтч/СумПоСтавке") and str(v).strip() for k, v in values.items())

    if has_sum_nds_total and has_nds_percent:
        errs.append("ВсегоАктОтч: одновременно заполнять СумНалВсего и ОтсСумНДС нельзя")

    if pr_nds == "0" and not (has_sum_nds_total or has_nds_percent):
        errs.append("ПрНДСВИтог=0: заполните либо СумНалВсего, либо ОтсСумНДС")

    if pr_nds == "0" and has_sum_by_rate:
        errs.append("ПрНДСВИтог=0: блок СумПоСтавке не должен заполняться")

    if pr_nds == "1" and has_nds_percent:
        errs.append("ПрНДСВИтог=1: поле ОтсСумНДС не должно заполняться (используются числовые суммы НДС)")

    if pr_nds == "1" and not (has_sum_nds_total or has_sum_by_rate):
        errs.append("ПрНДСВИтог=1: заполните СумНалВсего и/или детализацию СумПоСтавке")

    if pr_nak == "0":
        forbidden_nak = [k for k in values.keys() if k.startswith("/Файл/Документ/ВсегоАктСНач")]
        if forbidden_nak:
            errs.append("ПрНакИтог=0: блок ВсегоАктСНач не должен быть заполнен")

    if pr_ras == "0":
        forbidden_ras = [k for k in values.keys() if k.startswith("/Файл/Документ/СвОРасч")]
        if forbidden_ras:
            errs.append("ПрСведРасчСогл=0: блок СвОРасч не должен быть заполнен")

    return errs


def _render(request: Request, defaults: dict, disabled: set[str], id_builder: dict | None = None, result=None, errors=None, xml_diff: list[str] | None = None):
    minimal_mode = request.query_params.get("mode") == "minimal"
    id_builder = id_builder or dict(ID_BUILDER_DEFAULTS)
    id_preview = _autogen_file_id(id_builder)
    conditional_pairs = _conditional_required(defaults)
    conditional_reasons = {p: reason for p, reason in conditional_pairs}
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "fields": FIELDS,
            "groups": _grouped_fields(minimal_only=minimal_mode),
            "defaults": defaults,
            "disabled": disabled,
            "result": result,
            "errors": errors or [],
            "minimal_mode": minimal_mode,
            "profiles": _profile_names(),
            "id_builder": id_builder,
            "id_preview": id_preview,
            "field_hints": FIELD_HINTS,
            "doc_fallback": DOC_FALLBACK,
            "human_cards": HUMAN_CARDS,
            "conditional_reasons": conditional_reasons,
            "conditional_pairs": conditional_pairs,
            "xml_diff": xml_diff or [],
        },
    )


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    state = load_state()
    return _render(request, state.get("defaults", {}), set(state.get("disabled", [])), state.get("id_builder", dict(ID_BUILDER_DEFAULTS)))


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


@app.post("/profiles/save")
async def save_profile(request: Request, profile_name: str = Form(...)):
    state = load_state()
    safe = re.sub(r"[^a-zA-Z0-9_\-а-яА-Я]", "_", profile_name).strip("_") or "default"
    (PROFILES_DIR / f"{safe}.json").write_text(
        json.dumps({"defaults": state.get("defaults", {}), "disabled": state.get("disabled", []), "id_builder": state.get("id_builder", dict(ID_BUILDER_DEFAULTS))}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return RedirectResponse(url="/", status_code=303)


@app.get("/profiles/load/{name}")
async def load_profile(name: str):
    p = PROFILES_DIR / f"{name}.json"
    if p.exists():
        save_state(json.loads(p.read_text(encoding="utf-8")))
    return RedirectResponse(url="/", status_code=303)


@app.post("/generate", response_class=HTMLResponse)
async def generate(request: Request):
    form = await request.form()

    values = {}
    disabled = []
    form_dict = dict(form)

    id_builder = {
        "id_op_pol": str(form.get("id::id_op_pol", "000")).strip() or "000",
        "code_pol": str(form.get("id::code_pol", "0000000000")).strip() or "0000000000",
        "id_op_otpr": str(form.get("id::id_op_otpr", "000")).strip() or "000",
        "code_otpr": str(form.get("id::code_otpr", "0000000000")).strip() or "0000000000",
    }
    # Сначала забираем ключевые настройки документа из верхнего блока UI
    for p in MANUAL_SETTING_PATHS:
        v = str(form.get(f"v::{p}", "")).strip()
        if v:
            values[p] = v

    for f in FIELDS:
        key = f.path
        if key in MANUAL_SETTING_PATHS or key in SYSTEM_LOCKED_PATHS:
            continue

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

    # hard constraints from format
    values["/Файл/@ВерсФорм"] = "1.00"
    values["/Файл/Документ/@КНД"] = "1110335"
    values["/Файл/Документ/@ДатаИнфПодр"] = values.get("/Файл/Документ/@ДатаИнфПодр") or _now_date()
    values["/Файл/Документ/@ВремИнфПодр"] = values.get("/Файл/Документ/@ВремИнфПодр") or _now_time()

    id_builder_errors = _validate_id_builder(id_builder)
    manual_mode = str(form.get("id::manual_mode", "")).lower() in {"on", "1", "true"}
    manual_file_id = str(form.get("id::manual_file_id", "")).strip()
    if manual_mode and manual_file_id:
        values["/Файл/@ИдФайл"] = manual_file_id
    else:
        values["/Файл/@ИдФайл"] = _autogen_file_id(id_builder)

    id_format_errors: list[str] = []
    if not _is_valid_file_id(values.get("/Файл/@ИдФайл", "")):
        id_format_errors.append("ИдФайл не соответствует шаблону ON_AKTREZRABP_<13цфр>_<13цфр>_<YYYYMMDD>_<GUID>")

    # business conditional rules (v1 -> расширенная версия)
    conditional = _conditional_required(values)

    effective_required = _effective_required_paths(values)
    missing_required = [p for p in effective_required if not values.get(p)]
    missing_conditional = [(p, reason) for p, reason in conditional if not values.get(p)]
    val_errors = _field_validation_errors(values)
    combo_errors = _impossible_combinations(values)

    if missing_required or missing_conditional or val_errors or id_builder_errors or id_format_errors or combo_errors:
        state = load_state()
        errs = [f"Не заполнено обязательное поле: {m}" for m in missing_required[:50]]
        errs += [f"Не заполнено условно-обязательное поле: {p} — {reason}" for p, reason in missing_conditional[:50]]
        errs += id_builder_errors
        errs += id_format_errors
        errs += combo_errors
        errs += val_errors[:50]
        return _render(request, {**state.get("defaults", {}), **values}, set(disabled), id_builder, None, errs)

    root = build_xml_from_values(values)
    file_id = str(values.get("/Файл/@ИдФайл", "on_aktrezrabp"))
    safe_file_id = re.sub(r"[^A-Za-z0-9_\-.]", "_", file_id)
    xml_path = OUT_DIR / f"{safe_file_id}.xml"
    xml_path.write_bytes(
        (
            b'<?xml version="1.0" encoding="windows-1251"?>\n'
            + __import__("lxml.etree").etree.tostring(root, encoding="windows-1251", pretty_print=True)
        )
    )

    errors = validate_xml(root, XSD_PATH)

    prev_xml = _latest_xml_file(exclude_name=xml_path.name)
    xml_diff: list[str] = []
    if prev_xml:
        xml_diff = list(
            difflib.unified_diff(
                _xml_text_for_diff(prev_xml),
                _xml_text_for_diff(xml_path),
                fromfile=prev_xml.name,
                tofile=xml_path.name,
                lineterm="",
            )
        )

    state = {
        "defaults": values,
        "disabled": disabled,
        "id_builder": id_builder,
    }
    save_state(state)

    return _render(
        request,
        values,
        set(disabled),
        id_builder,
        result={"file": xml_path.name, "valid": len(errors) == 0},
        errors=errors,
        xml_diff=xml_diff,
    )


@app.get("/download/{name}")
async def download(name: str):
    p = OUT_DIR / name
    if not p.exists():
        return RedirectResponse("/")
    return FileResponse(str(p), filename=name, media_type="application/xml")
