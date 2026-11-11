# mBank eMakler Report Analysis (sanitized)

## Scope

This document summarizes the structure of the local mBank eMakler CSV reports used for a
future `mBank -> eMakler` source adapter. It is based only on local samples and contains
no real account numbers, names, balances, or full transaction histories.

## Provided samples

Directory: `local-samples/mBank eMakler/`

Observed files:

- `eMAKLER_historia_transakcji_YYYY.Csv` — executed buy/sell transactions.
- `eMAKLER_historia_finansowa_YYYY.Csv` — cash movements on the investment account.

The samples cover 2021-2026 and are split by calendar year (maximum report period is one year).
No `historia zleceń` or `Zapisy` sample is present in the provided directory; only a Windows
`Zone.Identifier` sidecar exists for `historia_zlecen`. Those report types still need to be
analyzed before the adapter can claim full mBank eMakler support.

## Common file properties

- Encoding: Windows-1250 (CP1250), not UTF-8.
- Line endings: LF in the observed files.
- Delimiter: semicolon (`;`).
- Decimal separator: comma (`,`).
- Thousands separator: space (` `).
- Date/time format: `DD.MM.YYYY HH:mm:ss` (24-hour clock).
- Report files are not plain header-first CSV files. A metadata block precedes the table.

The current generic CSV reader (`src/lib/file-readers/csv.ts`) assumes UTF-8 and a header in the
first line. An mBank adapter will need encoding detection/conversion and header-row detection.

## Metadata block

Both report types start with the same bank header and account metadata:

```text
mBank S.A. Bankowość Detaliczna
Skrytka Pocztowa 2108
90-959 Łódź 2
www.mBank.pl
mLinia: 801 300 800
+48 (42) 6 300 800

eMAKLER - Historia transakcji   # or: eMAKLER - Historia finansowa

#Imię i nazwisko
<name>

#Nr rachunku mBM
<account number>

#Nr rachunku powiązanego
#

#Data
<report generation date>

Kryteria wyszukiwania
#Data od
<from date>
#Data do
<to date>
#Wybrana kategoria
Brak
#Wybrany typ instrumentu
Brak
#Wybrany papier
Brak
```

Recommended detection keys:

- Report type from the `eMAKLER - ...` title.
- Account id from `#Nr rachunku mBM`.
- Report period from `#Data od` / `#Data do`.
- Report generation date from `#Data`.

The account number and customer name are PII and must not be logged or stored beyond parsing.

## Transaction report (`Historia transakcji`)

Table header:

```text
Czas transakcji;Papier;Giełda;K/S;Liczba;Kurs;Waluta;Prowizja;Waluta;Wartość;Waluta
```

Columns:

1. `Czas transakcji` — transaction timestamp.
2. `Papier` — broker instrument code (not necessarily a standard market ticker).
3. `Giełda` — exchange/market code, e.g. `WWA-GPW`, `GBR-LSE`.
4. `K/S` — `K` = buy, `S` = sell.
5. `Liczba` — quantity. Observed values are integers in the provided samples; fractional quantities are possible in real reports but were not observed.
6. `Kurs` — unit price.
7. `Waluta` — trade currency, e.g. `PLN`, `USD`.
8. `Prowizja` — commission/fee.
9. `Waluta` — fee currency. Observed as `PLN` only.
10. `Wartość` — total value, always `PLN` in the observed samples.
11. `Waluta` — value currency. Observed as `PLN` only.

Example anonymized row:

```text
12.12.2023 09:33:21;PKNORLEN;WWA-GPW;K;5;64,03;PLN;5,00;PLN;320,15;PLN
```

Mapping to the canonical model:

- `K` -> `BUY`
- `S` -> `SELL`
- `Liczba` -> `quantity`
- `Kurs` + trade currency -> `price`, `currency`
- `Prowizja` -> `fee`
- `Wartość` -> PLN-denominated total value
- `Czas transakcji` -> `date`
- `Papier` -> `ticker` (broker code; needs resolution to a Wealthfolio symbol)
- `Giełda` -> metadata/exchange, useful for validation and symbol resolution

Important FX observation: `Kurs` can be in `USD` while `Wartość` is in `PLN`. Therefore the report already
contains an implicit FX rate:

```text
fx = Wartość / (Liczba * Kurs)
```

This can be used as a verified FX rate instead of estimating it. The fee is in `PLN`, so if Wealthfolio
stores the fee in the activity currency, the adapter must decide whether to convert the fee or keep it as
a PLN amount. This needs validation against Wealthfolio import behavior.

Ticker resolution note: mBank `Papier` values are broker-specific names/codes (e.g. `PKNORLEN`,
`RBOT LN ETF`) rather than standard tickers. The transaction report does not contain an ISIN. The future
adapter should reuse the market ticker resolver and/or maintain an explicit alias table. The financial
history report contains ISINs in `WYC` rows, which can be used as a secondary cross-reference for sold
instruments.

## Financial history report (`Historia finansowa`)

Table header:

```text
Data;Opis;Kwota
```

Some rows contain an extra empty field before the amount (notably dividend rows):

```text
30.09.2022 15:17:52;Dywidenda: DP: 2022-09-21 IE00B6YX5C33 (SPY5 LN ETF);;13,29
```

The parser should therefore take the last non-empty semicolon field as the amount and treat the first field
as the description.

Observed description families:

1. `Dywidenda: DP: <YYYY-MM-DD> <ISIN> (<ticker>)`
   - Cash dividend payment.
   - Amount is in the final field.
   - Suggested mapping: `DIVIDEND`.
   - Tax withholding is not shown separately in the observed samples; the amount appears to be the paid
     dividend amount. Whether it is gross or net of tax is not yet verified.

2. `IKZE <year>` or `IKZE <year> ...`
   - Cash deposit into an IKE/IKZE-style retirement subaccount.
   - Suggested mapping: `DEPOSIT`.

3. `NA CEL INWESTYCYJNY Z OSZCZĘDNOŚCI`
   - Cash moved from savings to the investment account.
   - Suggested mapping: `DEPOSIT` (or `TRANSFER` if the user prefers transfer semantics).

4. `WYC: <id> NOT: <id> ZLC: <id> PW: <ISIN>`
   - Settlement of an executed sell order; amount equals net sale proceeds.
   - These rows duplicate the cash effect of `SELL` activities from the transaction report.
   - Suggested handling: skip as an activity, or use only for reconciliation/validation.

5. `Blokada środków pod zlecenie kupna nr <order id>`
   - Negative cash reservation for a pending buy order.
   - Suggested handling: skip; importing it would duplicate the later `BUY`.

6. `Odblokowanie środków pod zlecenie nr <order id> (całkowita realizacja|modyfikacja)`
   - Release of a previously blocked cash amount.
   - Suggested handling: skip; this is an internal settlement event.

No explicit interest, fee, tax withholding, or withdrawal rows were present in the provided samples. They
may exist in other periods and must be handled as `UNKNOWN` until verified.

## Multi-file and year handling

- Each file covers at most one year.
- A complete history requires uploading multiple yearly files.
- The adapter should merge files and deduplicate by a stable source id.
- The transaction report does not provide an explicit operation id. A synthetic id should be derived from
  timestamp, instrument, side, quantity, price, and value, with collision handling for identical fills.
- The financial history report also has no explicit id; derive ids from date, description, and amount.
- Cross-report deduplication is required: `WYC` settlements must not create duplicate cash activities when
  the corresponding `SELL` rows are imported.

## Suggested adapter behavior

1. Detect file kind from the `eMAKLER - ...` title and header row.
2. Convert CP1250 to UTF-8 before parsing.
3. Locate the table header row instead of assuming line 1.
4. Parse metadata (`account id`, period, generation date) without logging it.
5. Parse transaction rows into `BUY`/`SELL`.
6. Parse financial-history rows into `DIVIDEND`, `DEPOSIT`, and possibly `INTEREST`/`FEE`/`TAX_WITHHOLDING`.
7. Skip internal settlement rows (`Blokada`, `Odblokowanie`, `WYC`) or expose them as diagnostics only.
8. Derive FX rates from `Wartość / (Liczba * Kurs)` for non-PLN trades.
9. Resolve mBank instrument codes to Wealthfolio symbols via the existing ticker resolver.
10. Validate that sells in the transaction report have matching settlement rows when financial history is
    also supplied.
11. Report row-level warnings for unmapped descriptions and unresolved symbols.

## Open questions

- Whether quantity can be fractional in production reports.
- Whether `Papier` codes can be mapped deterministically to standard tickers without market search.
- Whether dividend amounts are gross or net of withholding tax.
- Whether interest, fees, taxes, withdrawals, and corporate actions appear in other periods.
- Whether `Zlecenia` reports contain pending/unexecuted orders that should be ignored.
- Whether `Zapisy` (subscription/rights) reports require a separate operation type.
- How Wealthfolio handles PLN fees attached to USD-denominated trades.
- Whether `IKZE` deposits should be treated as ordinary deposits or transfers.

## Recommended next steps

1. Collect anonymized/synthetic `Zlecenia` and `Zapisy` samples.
2. Add a CP1250-aware CSV reader or a byte-decoding step in the file reader layer.
3. Implement `src/lib/sources/mbank/` with an `emakler` subtype and shared canonical-model mapping.
4. Add source-subtype selection to the UI (`mBank` -> `eMakler`) and enable mBank once parsing works.
5. Add synthetic fixtures and parser tests before enabling direct import.
