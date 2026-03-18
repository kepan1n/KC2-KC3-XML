# KC2-KC3-XML — веб-форма

Текущий статус:

- production-full веб-форма по КС-2 / КС-3 / удержаниям
- сохранение/загрузка формы на сервере
- экспорт JSON
- экспорт XML 1110335
- локальная XSD-валидация
- production-full XML по small sample прошёл внешнюю проверку в Контуре без замечаний

## Быстрый запуск одной командой

```bash
./scripts/install_and_run.sh
```

Что делает скрипт:
- создаёт `.venv`, если её ещё нет;
- ставит Python-зависимости из `requirements.txt`;
- запускает локальный сервер.

После старта открывай:

<http://127.0.0.1:4173/variants/modern-light/>

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
- `saved-forms/` — сохранённые формы
- `output/` — сгенерированные XML/JSON для проверок

## Текущий рабочий эталон

- small sample из `small sample.xlsx`
- итоговый XML для проверки: `output/small-sample-full.xml`

## Дальше

Следующий этап после small sample:
- вернуться к большому исходному Excel с несколькими КС-2;
- перенести production-full подход на более сложные данные без потери структуры XML.
