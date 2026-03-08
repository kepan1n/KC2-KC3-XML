# Эталонные сценарии Sprint A

Набор стартовых сценариев для ручной проверки формы и rule-engine:

1. `01_base_minimal.json` — базовый валидный минимум
2. `02_nds_total.json` — НДС в итоге (`ПрНДСВИтог=1`)
3. `03_cumulative.json` — накопительный итог (`ПрНакИтог=1`)
4. `04_calculation_info.json` — расчеты согласованы (`ПрСведРасчСогл=1`)
5. `05_foreign_currency.json` — валюта договора ≠ 643 (включаются валютные итоги)

Файлы содержат ключевые поля для проверки rule-engine и невозможных комбинаций.

Быстрая проверка всех сценариев:

```bash
python scripts/check_scenarios.py
```

Опционально (строгий режим с XSD):

```bash
python scripts/check_scenarios.py --xsd
```
