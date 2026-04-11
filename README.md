# KC2-KC3-XML — веб-форма

Текущий статус:

- production-full **single-sheet** веб-форма: одна форма = один акт / лист КС-2
- сохранение/загрузка формы на сервере
- экспорт JSON
- экспорт XML 1110335 (`P`, подрядчик)
- экспорт XML 1110336 (`Z`, заказчик)
- локальная XSD-валидация
- КС-3 выведен из активного пользовательского сценария и остаётся только как legacy-контекст совместимости
- экспорт комплекта **P + Z** для текущего листа одним ZIP-архивом
- корректировочные строки / отрицательные секции из большого workbook маппятся в XSD-safe модель через `ПрНовОбст` / `ПрИспрОш` + `УчОшИНовОбстСт`, без минусовых totals на уровне `Раздел`
- production-full XML по `small sample` прошёл внешнюю проверку в Контуре без замечаний
- backend-валидация single-sheet экспорта теперь не режет `P` XML на полях, которые штатно закрываются template / generator fallback-значениями; из-за этого `primer-zapolneniya` снова проходит per-sheet regression
- `saved-forms/primer-zapolneniya.json` сейчас генерирует валидный per-sheet XML по всем листам КС-2
- стартовый sample `variants/modern-light/data/sample-data.json` теперь тоже хранится как реальный single-sheet state, а не как legacy multi-sheet workbook, который урезается в рантайме
- для multi-KS2 удержания теперь требуют явную привязку к листу через `ks2SheetId`; backend больше не раскладывает `holdbacks.sections` по листам текстовой эвристикой
- per-sheet backend-модель по `31` теперь сохраняет автостроки зачета аванса, парсит документ `№ / дата / допсведения` и прокидывает richer-расшифровку в `ИнфПолСвОРасч`
- ручные строки `ВидТреб / ВидУдерж` теперь тоже можно привязывать к конкретному листу КС-2; per-sheet projection и UI работают по этой привязке

Активный пользовательский сценарий сейчас такой:
- заполнить один текущий лист КС-2;
- проверить удержания / settlement-строки только для этого листа;
- получить связанный комплект **`P + Z`**.

Legacy multi-KS2 и старые КС-3 данные сохраняются только как миграционный / совместимый слой.

## Быстрый запуск одной командой

```bash
./scripts/install_and_run.sh
```

Что делает скрипт:
- создаёт `.venv`, если её ещё нет;
- обновляет `pip/setuptools/wheel`;
- ставит Python-зависимости из `requirements.txt`;
- запускает локальный сервер.

После старта открывай:

- локально: <http://127.0.0.1:4173/variants/modern-light/>
- из сети: `http://<IP-адрес-хоста>:4173/variants/modern-light/`

Скрипт попытается автоматически открыть TCP-порт в `ufw`, если `ufw` установлен.

Можно указать свой порт:

```bash
./scripts/install_and_run.sh 4213
```

## Обычный запуск

Если окружение уже подготовлено:

```bash
./scripts/run_local.sh
```

## Основные файлы

- `variants/modern-light/` — актуальный интерфейс
- `scripts/run_local_server.py` — локальный сервер + API
- `scripts/generate_xml_from_export.py` — генерация подрядческого XML (`1110335`) из экспортной модели
- `scripts/generate_customer_xml_from_export.py` — генерация customer XML (`1110336`) и per-sheet Z-экспортов
- `scripts/validate_xml_xsd.py` — XSD-валидация
- `scripts/export_and_validate_xml.sh` — CLI: экспорт + валидация
- `scripts/check_primer_corrections_regression.py` — регрессионная проверка большого workbook с корректировками / отрицательными секциями
- `scripts/check_holdback_sheet_binding_regression.py` — регрессия по строгой привязке удержаний к `ks2SheetId`
- `scripts/check_advance_31_regression.py` — регрессия по richer per-sheet модели зачета аванса / кода `31`
- `scripts/check_manual_settlement_per_sheet_regression.py` — регрессия по ручным per-sheet строкам `ВидТреб / ВидУдерж`
- `scripts/check_customer_per_sheet_pair_regression.py` — регрессия по связанной per-sheet паре `P + Z`
- `scripts/check_modern_light_sample_pair_regression.py` — smoke/regression по стартовому sample `modern-light`: одна single-sheet пара `P + Z` должна собираться и проходить XSD
- `scripts/check_single_sheet_ui_contract_regression.py` — регрессия по active UI-контракту single-sheet режима (`modern-light`)
- `scripts/check_single_sheet_docs_contract_regression.py` — регрессия по README / `nalog docs/Прогресс`, чтобы проектные документы не откатывались к старому KS-3 / multi-sheet описанию
- `scripts/check_single_sheet_fallback_validation_regression.py` — регрессия по backend fallback-логике обязательных XML manual-полей в single-sheet `P` экспорте
- `scripts/check_single_sheet_autobind_regression.py` — регрессия по auto-binding: active single-sheet state и split single-sheet формы должны собирать `P + Z` без явных `ks2SheetId`
- `scripts/check_single_sheet_fixture_minimality_regression.py` — регрессия по curated single-sheet fixtures: в активных sample/fixtures не должно оставаться legacy extra sheets, KS-3 rows и redundant `ks2SheetId`
- `scripts/single_sheet_state_helpers.py` — общие helper-функции для очистки redundant single-sheet bindings / legacy sheet-мусора
- export generators `scripts/generate_xml_from_export.py` и `scripts/generate_customer_xml_from_export.py` теперь тоже прогоняют active state через этот single-sheet cleanup contract перед сборкой `P + Z`
- `scripts/check_split_single_sheet_pair_regression.py` — регрессия по splitter-выходу: каждая разложенная форма должна стать single-sheet, не тащить redundant `ks2SheetId` и собирать валидную пару `P + Z`
- `scripts/split_legacy_multi_sheet_form.py` — splitter старых multi-sheet JSON в отдельные single-sheet формы
- `scripts/check_split_legacy_single_sheet_regression.py` — регрессия по splitter-скрипту
- `scripts/check_xml_scopes_backend_regression.py` — регрессия по прямому backend-чтению `xmlP/xmlZ`
- `saved-forms/` — сохранённые формы
- `output/` — сгенерированные XML/JSON для проверок

## Текущий рабочий эталон

- small sample из `small sample.xlsx`
- итоговый XML для проверки: `output/small-sample-full.xml`
- большой demo/workbook для регрессии: `saved-forms/primer-zapolneniya.json`

## Regression check

Проверка большого кейса с корректировками / отрицательными секциями:

```bash
python3 scripts/check_primer_corrections_regression.py
```

Скрипт проверяет, что:
- per-sheet XML по `primer-zapolneniya.json` генерируется по всем листам КС-2;
- каждый файл проходит XSD;
- totals на уровне `Раздел` не уходят в минус;
- корректировочные строки размечаются через `ПрНовОбст` / `ПрИспрОш` + `УчОшИНовОбстСт`.

Дополнительно для привязки удержаний к листам КС-2:

```bash
python3 scripts/check_holdback_sheet_binding_regression.py
```

Скрипт проверяет, что:
- per-sheet projection идёт строго по явному `ks2SheetId`;
- текст названия/комментария удержания больше не влияет на выбор листа;
- отсутствие `ks2SheetId` в multi-KS2 режется валидацией до генерации XML.

И отдельно для richer-модели авансов / кода `31`:

```bash
python3 scripts/check_advance_31_regression.py
```

Скрипт проверяет, что:
- при per-sheet projection backend сохраняет автостроки `31` рядом с `32`;
- из `advanceDoc` достаются номер / дата документа;
- richer-расшифровка по авансам попадает в `ИнфПолСвОРасч`;
- XSD-ready строка остаётся совместимой с текущим compact-профилем.

И отдельно для ручных per-sheet строк `ВидТреб / ВидУдерж`:

```bash
python3 scripts/check_manual_settlement_per_sheet_regression.py
python3 scripts/check_modern_light_sample_pair_regression.py
python3 scripts/check_single_sheet_ui_contract_regression.py
python3 scripts/check_single_sheet_docs_contract_regression.py
python3 scripts/check_single_sheet_fallback_validation_regression.py
python3 scripts/check_single_sheet_autobind_regression.py
python3 scripts/check_single_sheet_fixture_minimality_regression.py
python3 scripts/check_split_single_sheet_pair_regression.py
```

Скрипт по sample pair regression дополнительно проверяет, что:
- стартовый `modern-light` sample реально собирает одну single-sheet пару `P + Z`;
- и подрядческий `P`, и customer `Z` проходят XSD без ручной подготовки sample перед запуском UI.

Скрипт по docs contract regression дополнительно проверяет, что:
- README и `nalog docs/Прогресс` описывают именно текущий single-sheet продукт;
- старые активные формулировки про КС-3 / multi-sheet UX не возвращаются в опорную документацию.

Скрипт по UI-контракту дополнительно проверяет, что:
- `modern-light` остаётся single-sheet интерфейсом для `P + Z`;
- в active UI не возвращаются мёртвые обработчики multi-sheet / КС-3;
- customer readiness не опирается на старые `ks3*` fallback-поля.

Скрипт по fallback-валидации дополнительно проверяет, что:
- backend не режет рабочий single-sheet `P` export на XML manual-полях,
  которые в текущем продукте допустимо закрывать generator/template fallback-значениями;
- `primer-zapolneniya` остаётся XSD-valid даже если эти manual-поля очищены в export payload.

Скрипт по single-sheet autobind regression дополнительно проверяет, что:
- active single-sheet state не зависит от явных `ks2SheetId` в удержаниях / manual settlement-строках;
- стартовый sample и split single-sheet формы продолжают собирать валидную пару `P + Z`, даже если эти поля убрать.

Скрипт по fixture minimality regression дополнительно проверяет, что:
- curated active single-sheet fixtures (`small-sample`, `modern-light sample`) не тащат extra legacy sheets;
- в них нет активных KS-3 строк;
- и в single-sheet данных не остаются redundant `ks2SheetId`.

Скрипт по split single-sheet pair regression дополнительно проверяет, что:
- splitter старых multi-sheet форм действительно выпускает отдельные active single-sheet формы;
- у каждой такой формы нет extra legacy sheets и активных KS-3 строк;
- каждая split-форма собирает валидную пару `P + Z`.

Скрипт по manual settlement дополнительно проверяет, что:
- ручные settlement-строки фильтруются по `ks2SheetId` при per-sheet projection;
- каждая строка остаётся только в своём XML по листу КС-2;
- отсутствие `ks2SheetId` у активной ручной строки в multi-KS2 режется валидацией до генерации XML.

Схема текущего и целевого single-sheet маппинга полей: `nalog docs/схема single-sheet маппинга Excel в XML.md`

Текущий базовый workbook-эталон для дальнейшей чистки UI/модели: `new example 1 sheet.xlsx`

## Customer XML / комплект P+Z

Локальный сервер теперь умеет:
- `POST /api/export-customer-xml` — выгрузить `Z` (`1110336`) как XML или ZIP по листам КС-2;
- `POST /api/export-xml-bundle` — выгрузить комплект `P + Z` одним ZIP;
- `POST /api/preview-customer-xml-sheet` — собрать и проверить per-sheet preview customer XML;
- `POST /api/forms/split-single-sheet` — разложить legacy multi-sheet state на набор single-sheet JSON.

В UI добавлены:
- **Экспорт P + Z (ZIP)**
- XML preview для пары файлов **P + Z** прямо во вкладке `XML`
- readiness-check для customer XML `Z`: checklist по обязательным реквизитам заказчика и подсветка fallback-значений
- внутренняя модель XML делится на `xmlP` и `xmlZ`; backend уже умеет читать их напрямую, а legacy `xml.*` остаётся fallback-слоем совместимости
- верхний слой реквизитов начинает мигрировать из `common.*` в `documentContext.*`; `common` пока остаётся alias/fallback для совместимости
- форма реквизитов и блок удержаний дальше упрощаются под новый single-sheet workbook: без выбора листа КС-2 у удержаний и без активного КС-3 UX
- single-sheet ограничение: в редакторе всегда только один лист КС-2; если загрузится старый multi-sheet JSON, дополнительные листы сохраняются в `legacy.extraKs2Sheets`, но не участвуют в редактировании и экспорте
- кнопка для разложения legacy multi-sheet формы в отдельные single-sheet JSON через `saved-forms/split-single-sheet/`

## Дальше

Следующие практические шаги:
- при необходимости расширить readiness-check по `Z` отдельными бизнес-правилами заказчика (например, более жёсткая проверка доверенностей / извещений по расчётам);
- при необходимости ужесточить splitter для совсем старых форм с ещё более слабой привязкой удержаний / settlement-строк к листу;
- сохранить регрессионные проверки для `small sample`, `primer-zapolneniya` и legacy multi-KS2 backend-экспортов как обязательный smoke-check перед изменениями backend-а;
- если понадобится, расширить ручные settlement-строки отдельными полями `documentName / documentNumber / documentDate / documentExtra`, а не только `documentRef`.
