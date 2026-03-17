from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import HTMLResponse, Response
from fastapi.templating import Jinja2Templates
from fastapi import Request

from .models import FormPayload
from .services import build_xlsx, build_xml, calculate

app = FastAPI(title="KC2-KC3 XML Generator")
templates = Jinja2Templates(directory="app/templates")


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/api/calculate")
def calculate_api(payload: FormPayload):
    return calculate(payload)


@app.post("/api/export/xml")
def export_xml(payload: FormPayload):
    content = build_xml(payload)
    return Response(
        content=content,
        media_type="application/xml",
        headers={"Content-Disposition": 'attachment; filename="akt.xml"'},
    )


@app.post("/api/export/xlsx")
def export_xlsx(payload: FormPayload):
    content = build_xlsx(payload)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="akt.xlsx"'},
    )
