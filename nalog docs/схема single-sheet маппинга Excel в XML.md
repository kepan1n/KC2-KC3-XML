# Схема single-sheet маппинга Excel → XML

Обновлено: 2026-03-29

## Зачем этот документ

Актуальный эталонный workbook для дальнейших упрощений: `new example 1 sheet.xlsx`.

Проект исторически рос из Excel-workbook, поэтому многие поля были разложены по состоянию приложения в логике **«как это лежало по вкладкам / блокам Excel»**, а не в логике **«как это реально нужно для XML 1110335 / 1110336 по методичке ФНС»**.

Теперь продуктовая модель упрощена:
- **1 форма = 1 лист КС-2**
- удержания = **один блок для этого листа**
- активные XML = **P (`1110335`) + Z (`1110336`)**
- КС-3 и Excel round-trip больше не являются целевым UX-направлением

Ниже — три слоя:
1. как поля раскиданы **сейчас**;
2. почему так получилось;
3. как их лучше переложить **по смыслу docx / налогового формата**.

---

## 1. Как данные разложены сейчас

### 1.1. `common.*` — общая шапка, пришедшая из Excel-шапки

Здесь лежит то, что исторически относилось к общей верхней части форм:
- стороны:
  - `common.developerName`
  - `common.techCustomerName`
  - `common.contractorName`
  - `common.*Okpo`
- объект / стройка:
  - `common.objectName`
  - `common.constructionObject`
- договор / коды:
  - `common.contractNumber`
  - `common.contractDate`
  - `common.okudKs2`
  - `common.okdpCode`
  - `common.currencyCode`
  - `common.currencyName`
- печатные подписи / нижние блоки:
  - `common.contractorSigner*`
  - `common.customerSigner*`
  - `common.techCustomerSigner*`
  - `common.ks2Accepted*`
  - `common.ks2Checked*`

### 1.2. `ks2Sheets[0]` — текущий активный лист КС-2

Теперь это главный рабочий документ.

Здесь лежит:
- шапка листа:
  - `ks2Sheets[0].document.number`
  - `ks2Sheets[0].document.date`
  - `ks2Sheets[0].document.periodFrom`
  - `ks2Sheets[0].document.periodTo`
  - `ks2Sheets[0].document.basis`
- строки работ:
  - `ks2Sheets[0].rows[]`
    - код
    - смета
    - наименование
    - единица
    - количество
    - цена
    - сумма
    - НДС / тип затрат / корректировочность и т.д.

### 1.3. `holdbacks.rows[]` — удержания / авансы

Это отдельный плоский список строк, исторически близкий к Excel-блоку удержаний:
- section-строки — верхний уровень блока
- subitem-строки — авансы / зачёты / подстроки внутри section

Сейчас в single-sheet режиме эти строки считаются блоком **только текущего листа**.

Типовые поля:
- `name`
- `retentionAmount`
- `retentionRate`
- `advanceReceived`
- `previousBalance`
- `closingAmount`
- `nextBalance`
- `advanceDoc`
- `comment`

### 1.4. `xmlExtras.manual` — то, чего нет в Excel, но нужно XML

Этот слой нужен потому, что XSD / методичка ФНС требуют поля, которых в исходном Excel нет или они не были надёжно структурированы.

Типовые группы:
- XML-реквизиты составителя:
  - `economicSubjectName`
  - `signerName`
  - `signerPosition`
  - `signerStatus`
  - `signatureType`
- адресно-регистрационные реквизиты:
  - `contractorInn`
  - `customerInn`
  - `developerPostalIndex`
  - `developerRegionCode`
  - `contractorPostalIndex`
  - `contractorRegionCode`
- реквизиты по смете / исправлению:
  - `estimateVersionCode`
  - `supplementDoc*`
  - `correction*`
- customer `Z`:
  - `customerAuthorityDoc*`
  - `customerAcceptance*`
  - `customerSettlementNotice`
  - `customerSignerPower*`
  - `customerSignerPaperPower*`

### 1.5. `xmlExtras.constants` — флаги режима генерации

Это не Excel-данные, а режимы генератора:
- cumulative mode
- compact mode
- VAT calc hints
- settlement approval mode
- и т.п.

### 1.6. `xmlExtras.settlementRows[]` — ручные строки `СвОРасч`

Это ручной override-слой поверх автоматически собранных удержаний.

Используется, когда нужен явный:
- `ВидТреб`
- `ВидУдерж`
- код вида
- сумма
- документ-основание
- иной вид / комментарий

### 1.7. `legacy.*`

Это уже слой совместимости, а не активной продуктовой модели.

Сейчас там могут жить:
- `legacy.extraKs2Sheets`
- `legacy.unassignedHoldbackRows`
- `legacy.unassignedSettlementRows`
- split metadata

---

## 2. Почему так получилось

### Причина 1. Проект стартовал как визуализация workbook, а не как чистая XML-модель

Изначально было естественно повторить структуру Excel:
- общая шапка
- КС-2
- КС-3
- удержания
- XML extras

Это ускорило старт, но оставило в модели наследие табов Excel.

### Причина 2. ФНС/XSD требует данных, которых в Excel нет как отдельной сущности

Поэтому появился отдельный слой `xmlExtras.manual`.

Он нужен, потому что в XML нужно явно задавать:
- статусы подписантов
- основания полномочий
- customer acceptance / refusal / defects
- notices по расчётам
- разные служебные реквизиты, которых Excel не даёт в чистом виде

### Причина 3. Раньше пытались поддерживать multi-sheet сценарий

Из-за этого появились:
- `ks2SheetId`
- фильтрация по листам
- per-sheet projection
- отдельные привязки удержаний и ручных settlement-строк к листам

Для активного продукта это стало перегрузом, поэтому UI переведён в single-sheet режим.

### Причина 4. КС-3 использовался как промежуточный контейнер агрегатов и шапки

Часть полей и fallback-логики долго жила вокруг KS-3, потому что:
- Excel действительно имел лист КС-3;
- в старой модели это был удобный агрегирующий документ;
- некоторые XML-блоки проще было сначала вывести из агрегатов.

Теперь это legacy-слой, и его надо вытеснять из активного UX.

---

## 3. Как лучше переложить данные по смыслу docx / ФНС

### Главный принцип

Новая модель должна повторять **не вкладки Excel**, а **смысл налогового электронного документа**.

То есть группировать данные не по источнику, а по роли в XML.

---

## 4. Рекомендуемая целевая модель

## 4.1. `documentContext`

Общее для текущего single-sheet акта:
- договор
- стороны
- объект
- валюта
- коды

Примерно сюда должны перейти нынешние `common.*`, но только те, которые реально нужны текущему листу и XML.

### Что сюда логично класть
- contract:
  - number
  - date
- parties:
  - contractor
  - customer
  - techCustomer
  - developer
- object:
  - constructionObject
  - objectName
  - objectOkpo
- codes:
  - okudKs2
  - okdpCode
  - currencyCode
  - currencyName

---

## 4.2. `sheet`

Один текущий лист КС-2.

### Что сюда класть
- number
- date
- periodFrom
- periodTo
- basis
- rows[]

Это уже почти соответствует нынешнему `ks2Sheets[0]`.

---

## 4.3. `holdbacks`

Отдельный блок именно для этого sheet.

### Что сюда класть
- guarantee retention
- advances received
- previous balance
- closing amount
- next balance
- supporting docs

Ключевая мысль: удержания должны быть привязаны **не к workbook**, а к **одному текущему акту**.

---

## 4.4. `xmlP`

Структурированные и дополнительные данные для подрядческого файла `P`.

### Что должно быть здесь
- поля, напрямую требуемые `1110335`
- contractor signer / XML composer
- estimate / correction metadata
- structured `СвОРасч`
- richer `ИнфПолФХЖ1`
- richer `ИнфПолСвОРасч`

То есть часть нынешнего `xmlExtras.manual` и `xmlExtras.constants` должна быть переименована в слой **настроек именно подрядческого XML**, а не абстрактных “extras”.

---

## 4.5. `xmlZ`

Отдельный слой данных для customer XML `Z`.

### Что сюда должно перейти
- основание подписания заказчика
- статус подписанта заказчика
- МЧД / доверенность
- acceptance / refusal / defects
- settlement notice
- причины несогласия / замечания

Это особенно важно: сейчас customer-поля размазаны по `common.*` и `xmlExtras.manual.*`, а логически они относятся к **роли заказчика в файле Z**.

Именно по docx ФНС это отдельная смысловая зона.

---

## 5. Что стоит перенести по-другому уже сейчас

### 5.1. Убрать KS-3 как активную пользовательскую сущность

Оставить только:
- fallback/compatibility внутри backend,
- но не использовать KS-3 как главный контейнер UI.

### 5.2. Перенести customer-специфичные поля из общего manual-слоя в отдельный `xmlZ`-блок

Сейчас они лежат рядом с подрядческими XML-полями, что путает.

Лучше разделить:
- `xmlP.manual.*`
- `xmlZ.manual.*`

### 5.3. Сделать holdbacks одной локальной моделью листа

Убрать остаточную мысль, что это “таблица удержаний по всей книге”.

Нужно мыслить так:
- текущий лист КС-2
- его удержания
- его `P`
- его `Z`

### 5.4. Перенести ручные `settlementRows` ближе к holdbacks / `СвОРасч`

Сейчас это отдельный XML-слой.

По смыслу ФНС это лучше воспринимать как:
- ручные корректировки блока расчётов текущего листа,
- а не абстрактные глобальные XML extras.

---

## 6. Практическая схема «как лучше»

## 6.1. Сейчас

- `common.*` ← Excel шапка
- `ks2Sheets[0]` ← лист КС-2
- `holdbacks.rows[]` ← отдельный блок удержаний
- `xmlExtras.manual.*` ← то, чего нет в Excel, но нужно XML
- `xmlExtras.settlementRows[]` ← ручной override `СвОРасч`
- `legacy.*` ← совместимость

## 6.2. Целевая схема

- `documentContext.*`
- `sheet.*`
- `holdbacks.*`
- `xmlP.*`
- `xmlZ.*`
- `legacy.*`

---

## 7. Рекомендуемая поэтапная миграция

### Этап A
Сохраняем текущую рабочую логику, но продолжаем single-sheet упрощение UI.

### Этап B
Добавляем splitter для старых multi-sheet JSON.

### Этап C
Начинаем внутреннюю миграцию имен:
- `xmlExtras.manual` → разделение на `xmlP` и `xmlZ`
- `common.*` → выделение в `documentContext`

Статус на 2026-03-29:
- `xmlP/xmlZ` уже заведены в UI/state и backend;
- `documentContext` уже заведён в UI/state как новый слой реквизитов, при этом `common` пока сохранён как alias/fallback.

### Этап D
Оставляем Excel-структуру только как import-совместимость, но не как внутреннюю ментальную модель приложения.

---

## 8. Короткий вывод

### Почему сейчас поля разложены «странно»
Потому что модель выросла из Excel-вкладок и постепенно обрастала XSD-требованиями.

### Как правильнее по docx ФНС
Разложить поля по смысловым ролям документа:
- контекст документа,
- текущий лист,
- удержания,
- подрядческий XML,
- customer XML.

### Что это даст
- меньше UI-сложности;
- меньше sheet-binding ошибок;
- меньше KS-3 наследия;
- более прозрачную модель для `P + Z`.
