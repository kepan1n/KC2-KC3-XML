#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INPUT_JSON="${1:-}"
OUTPUT_XML="${2:-$ROOT/output/generated_1110335.xml}"

if [[ -z "$INPUT_JSON" ]]; then
  echo "Usage: scripts/export_and_validate_xml.sh <export.json> [output.xml]" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT_XML")"
python3 "$ROOT/scripts/generate_xml_from_export.py" "$INPUT_JSON" -o "$OUTPUT_XML"
python3 "$ROOT/scripts/validate_xml_xsd.py" "$OUTPUT_XML"
echo "OK: $OUTPUT_XML"
