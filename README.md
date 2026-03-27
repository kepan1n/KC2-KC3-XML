# KC2-KC3-XML — веб-форма

Текущий статус:

- production-full веб-форма по КС-2 / КС-3 / удержаниям
- сохранение/загрузка формы на сервере
- экспорт JSON
- экспорт XML 1110335
- локальная XSD-валидация
- per-sheet режим для multi-KS2: **один XML = один лист КС-2**, экспорт нескольких листов идёт ZIP-архивом
- корректировочные строки / отрицательные секции из большого workbook маппятся в XSD-safe модель через `ПрНовОбст` / `ПрИспрОш` + `УчОшИНовОбстСт`, без минусовых totals на уровне `Раздел`
- production-full XML по `small sample` прошёл внешнюю проверку в Контуре без замечаний
- `saved-forms/primer-zapolneniya.json` сейчас генерирует валидный per-sheet XML по всем листам КС-2

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
- `scripts/generate_xml_from_export.py` — генерация XML из экспортной модели
- `scripts/validate_xml_xsd.py` — XSD-валидация
- `scripts/export_and_validate_xml.sh` — CLI: экспорт + валидация
- `scripts/check_primer_corrections_regression.py` — регрессионная проверка большого workbook с корректировками / отрицательными секциями
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

## Дальше

Следующие практические шаги:
- довести явную привязку удержаний / документов к `ks2SheetId`, чтобы убрать эвристику;
- расширить richer per-sheet модель по авансам / `31` рядом с уже рабочим `32`;
- сохранить регрессионные проверки для `small sample`, `primer-zapolneniya` и multi-KS2 ZIP как обязательный smoke-check перед изменениями backend-а.
