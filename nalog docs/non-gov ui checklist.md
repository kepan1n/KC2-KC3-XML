# Non-gov UI checklist for `modern-light`

Цель: довести single-sheet UX до состояния, где пользователю видно:
- что реально уходит в XML
- что уходит только через `ИнфПол...`
- что вычисляется
- что остаётся только в UI

Приоритеты: `must` -> `should` -> `nice-to-have`.

---

## MUST

- [x] **Показать видимый статус XML-связи у полей**
  - `core`
  - `ИнфПол`
  - `derived`
  - `UI-only`
  - Сделать легенду прямо в XML-pane

- [x] **Сделать issue-navigation из validation summary**
  - клик по ошибке -> переход к полю
  - отдельный action -> открыть XML preview на связанном узле

- [x] **Сделать блок `СвПродПер` более guided**
  - группировка: предъявление / срок принятия / сообщение о готовности
  - вместо трёх параллельных полей срока принятия — выбор одного режима

- [x] **Показать пользователю, где поле живёт семантически**
  - main XML node
  - only `ИнфПол`
  - service / derived
  - не экспортируется

---

## SHOULD

- [x] **Добавить компактную debug-card рядом с XML preview**
  - active sheet
  - holdbacks mode
  - payable mode
  - Z time mode (`DOCX: ЧЧ:ММ:СС`)
  - XSD compat normalization (`validation-only`)

- [x] **Сделать role-aware hints для сторон**
  - явно объяснять текущую модель: `застройщик / заказчик / техзаказчик`
  - не прятать это в документации

- [x] **Явно маркировать blocking/advisory rules**
  - что реально блокирует экспорт
  - что пока только warning

- [x] **Обновить sample outputs под текущий генератор**
  - `output/small-sample-full.xml`
  - `output/small-sample-customer.xml`

- [x] **Добавить отдельный regression на конфликт DOCX vs старой Z-XSD**
  - production XML -> `ЧЧ:ММ:СС`
  - validation adapter -> нормализация под legacy pattern только в тестах/preview

---

## NICE-TO-HAVE

- [x] **P/Z compare mode в preview**
  - side-by-side
  - подсветка source field
  - подсветка derived differences

- [x] **Семантическая mini-легенда в реквизитах**
  - например для полей ролей сторон и подписантов

- [x] **Фильтр полей по статусу**
  - показать только `core`
  - показать только `ИнфПол`
  - показать только `не экспортируется`

- [x] **Режим “подготовка к выгрузке”**
  - скрыть чисто печатные/UI-only реквизиты
  - оставить только влияющие на XML поля

---

## Suggested order

1. XML status badges + legend
2. validation -> field/XML navigation
3. guided `СвПродПер` block
4. preview debug-card
5. role-aware hints
6. docs/fixtures cleanup
