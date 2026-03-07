from __future__ import annotations

from pathlib import Path
from zipfile import ZipFile
import re
import xml.etree.ElementTree as ET


def _normalize(s: str) -> str:
    s = (s or "").lower().replace("ё", "е")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def extract_docx_paragraphs(docx_path: Path) -> list[str]:
    if not docx_path.exists():
        return []
    try:
        with ZipFile(docx_path, "r") as zf:
            xml_bytes = zf.read("word/document.xml")
    except Exception:
        return []

    try:
        root = ET.fromstring(xml_bytes)
    except Exception:
        return []

    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    out: list[str] = []
    for p in root.findall(".//w:p", ns):
        txt = "".join([t.text or "" for t in p.findall(".//w:t", ns)]).strip()
        if txt:
            out.append(txt)
    return out


def _tokens_from_field_path(path: str) -> list[str]:
    parts = [p for p in path.split("/") if p and p != "Файл"]
    if not parts:
        return []

    tokens: list[str] = []
    # Последние 2-3 сегмента обычно самые релевантные
    for p in parts[-3:]:
        if p.startswith("@"):
            p = p[1:]
        if p:
            tokens.append(p)

    # Разбивка CamelCase-like рус/лат на куски (грубо)
    more: list[str] = []
    for t in tokens:
        # разделяем по заглавным и цифрам
        chunks = re.findall(r"[A-ZА-ЯЁ]?[a-zа-яё]+|[A-ZА-ЯЁ]+(?![a-zа-яё])|\d+", t)
        for c in chunks:
            if len(c) >= 3:
                more.append(c)
    tokens.extend(more)

    # Уникальные
    seen = set()
    uniq = []
    for t in tokens:
        n = _normalize(t)
        if n and n not in seen:
            seen.add(n)
            uniq.append(n)
    return uniq


def build_doc_hints(docx_path: Path, field_paths: list[str], *, max_chars: int = 900) -> dict[str, str]:
    paragraphs = extract_docx_paragraphs(docx_path)
    if not paragraphs:
        return {}

    norm_par = [(_normalize(p), p) for p in paragraphs if len(p) > 10]
    hints: dict[str, str] = {}

    for path in field_paths:
        tokens = _tokens_from_field_path(path)
        if not tokens:
            continue

        scored: list[tuple[int, str]] = []
        for np, original in norm_par:
            score = 0
            for t in tokens:
                if t and t in np:
                    score += 2 if len(t) >= 5 else 1
            # слабый буст за упоминание полного имени последнего токена
            last = tokens[0] if tokens else ""
            if last and last in np:
                score += 1
            if score > 0:
                scored.append((score, original))

        if not scored:
            continue

        scored.sort(key=lambda x: x[0], reverse=True)
        best = []
        used = set()
        for s, txt in scored:
            if txt in used:
                continue
            used.add(txt)
            best.append(txt)
            if len(best) >= 3:
                break

        hint = "\n\n".join(best)
        if len(hint) > max_chars:
            hint = hint[:max_chars].rstrip() + "…"
        hints[path] = hint

    return hints
