# Project Context

## Current status

- Scaffolded Wealthfolio addon with XTB parser, CSV/XLSX file readers, and a basic converter UI.
- Wealthfolio SDK 3.9.0 types verified in `node_modules/@wealthfolio/addon-sdk`.
- Build and TypeScript checks pass with Node 18.19.1 (Vite warns; use Node 20.19+).
- Local XTB sample analyzed: workbook has `Closed Positions`, `Cash Operations`, and `Open Positions` sheets.
- Cash Operations header is on row 5 (0-based index 4); data starts row 6 (index 5).
- Supported XTB operation types: `Stock purchase`, `Stock sell`, `IKE deposit`, `Deposit`, `Free funds interest`, `Dividend`; `Total` rows are skipped.
- Wealthfolio activity import CSV header: `date,symbol,instrumentType,quantity,activityType,unitPrice,currency,fee,amount,fxRate,subtype,comment`.
- Verified symbol mapping from local sample: `.PL` -> `.WA`, `.UK` -> `.L`.
- No automated test runner is configured; only `tsc --noEmit` and `vite build` exist.

## Key files

- `src/lib/sources/xtb/parser.ts` — XTB parser and Wealthfolio CSV generation.
- `src/lib/market/ticker-resolver.ts` — search-assisted ticker resolution and metadata application.
- `src/lib/file-readers/` — CSV/XLSX readers.
- `src/pages/converter-page.tsx` — upload, preview, download.
- `local-samples/wealthfolio/wealthfolio_activities_v2.csv` — reference Wealthfolio activity format.

## Release configuration

- GitHub remote: `https://github.com/Vertig00/wealthfolio-addon-report-converter.git`.
- GitHub CLI (`gh`) is installed and authenticated as `Vertig00`.
- Release workflow: `.github/workflows/release.yml`.
- Installable artifact is created by `pnpm run package` as `dist/*..zip`.

## Open questions

- Exact handling of partial XTB fills and grouped position rows is not fully verified.
- Internal `Transfer` / `Subaccount transfer` rows are skipped only when their comment matches `Transfer from <id> to <id>` (subaccount transfers, net-zero within one Wealthfolio account). Other transfers are still imported. This avoids "incomplete transfer" warnings.
- IKE may show a temporary negative cash balance warning (e.g. 2025-06-05: -7.76 PLN) due to XTB timing; final balance reconciles (422.96 PLN).
- Dividend tax withholding and fee mapping are not yet represented.
- Direct Wealthfolio import (Stage 5) is not implemented.

## Refaktoryzacja i reconciliation (2026-11-09)

- Wyodrębniono `resolveFx` do `src/lib/sources/xtb/fx.ts` i builder `positionMap` do `src/lib/sources/xtb/position-map.ts` (bez zmiany zachowania).
- Dodano reconciliation Open Positions: brakujące loty promocyjne (cena otwarcia ~0) emitowane jako `BUY` z id `RECON-<positionId>` (cena promocyjna), żeby Wealthfolio utworzyło holding.
- Zweryfikowano na próbkach: PLN → 1 recon (SHELL), IKE → 0 recon (brak fałszywych duplikatów).

## Release

- v0.1.0 published: https://github.com/Vertig00/wealthfolio-addon-report-converter/releases/tag/v0.1.0

## XTB PLN sample analysis (2026-11-02)

Files analyzed locally (not committed):
- `local-samples/xtb/PLN_2588063_2006-01-01_2026-09-29-ALL.xlsx`
- `local-samples/xtb/PLN_2588063_2026-08-01_2026-11-02-UPDATE.xlsx`

Verified facts:
- Workbook layout matches known XTB variant: `Closed Positions`, `Cash Operations`, `Open Positions`.
- Cash Operations header row index 4, data from row index 5.
- Cash Operations columns: Type, Instrument, Ticker, Category, Time, Amount, ID, Comment, Product, Position ID.
- Ticker suffixes found: DE (535), UK (176), PL (194), US (137), NL (17), FR (5).
- ALL report: 1705 unique operation IDs. UPDATE report: 729 unique IDs, 504 overlapping with ALL, 225 update-only.
- Supported operation types already mapped: Stock purchase, Stock sell, Deposit, Free funds interest, Dividend.
- Additional operation types found: Subaccount transfer, Transfer, Withholding tax, Free funds interest tax, Close trade, Swap, Fractional shares, Commission, Correction.
- Products include `My Trades` and `Investment Plans`.
- Dividend comments use `SHR` per-share notation; withholding tax comments use `WHT %`.
- Buy/sell comments use both `OPEN BUY ... qty/total @ price` and `CLOSE BUY ... qty/total @ price`.

Open questions:
- Whether Subaccount transfer/Transfer should become Wealthfolio transfer activities or be skipped.
- Currency mapping for DE/FR/NL (likely EUR) and UK (likely USD for observed ETFs) needs verification against Wealthfolio import validation.
- Handling of Close trade, Swap, Fractional shares, Commission, and Correction rows needs product decisions.

## XTB fractional-share reverse splits (2026-11-06)

Verified facts:
- XTB records at least some reverse splits as `Fractional shares` with a comment like `<TICKER> split <new> for <old>`.
- Observed example: a 1-for-10000 reverse split has ratio `1 / 10000 = 0.0001`.
- Cash Operations rows are newest-first, so holdings before a split must be replayed chronologically.
- `ATO.FR` maps to `ATO.PA` through the existing `.FR` -> `.PA` rule; currency is EUR.

Implemented behavior in `src/lib/sources/xtb/parser.ts`:
- Detect `split <new> for <old>` on `Fractional shares` rows.
- Emit a Wealthfolio `SPLIT` row with the ratio in `amount` and `REVERSE_SPLIT` subtype when the ratio is below 1.
- Replay buy/sell quantities chronologically, apply prior splits, and emit a `SELL` for the fractional remainder paid in cash.
- Derive the fractional SELL price from the cash payout, position FX rate, and sold quantity.

Known limitation:
- In an update-only report without the original buys, the split itself can still be emitted, but the fractional cash SELL cannot be sized reliably.

## WSE ticker aliases (2026-11-06)

Verified against GPW/Yahoo Finance:
- `CCC.PL` (CCC S.A.) is now `MDV.WA` after the February 2026 rename to Modivo S.A.
- `K2H.PL` is now `FAB.WA` after the August 2023 rename to Fabrity Holding S.A.
- `FAB.PL` and `MDV.PL` keep their base ticker and only gain the `.WA` suffix.
- XTB historical reports can contain a mix of old and new tickers for the same ISIN.
- Implemented in `mapXTBSymbol` in `src/lib/sources/xtb/parser.ts`; update-mode deduplication in the UI reuses the same mapping.

## General ticker resolution (2026-11-06)

Implemented a provider-independent resolver in `src/lib/market/ticker-resolver.ts`:
- Uses the host `market.searchTicker(query)` API after the XTB parser produces transactions.
- Starts from the deterministic `mapXTBSymbol` result. If that exact symbol is found, the ticker is unchanged and no extra queries are made.
- If the exact mapped symbol is not found, searches by ISIN (when present), base ticker, and instrument name.
- Filters candidates by the expected exchange suffix and currency (`.WA`/PLN, `.PA`/EUR, `.AS`/EUR, `.L`/GBP-family, `.DE`/EUR, US symbols without a suffix).
- Only auto-applies an exact match or a conservative normalized-name match. Ambiguous, missing, or failed lookups keep the report/fallback symbol.
- Caches search queries for the current session and limits concurrency to avoid blocking the UI.

Integration points:
- `manifest.json` now declares the `market-data` / `searchTicker` permission.
- `src/addon.tsx` passes `ctx.api.market` into `ConverterPage`.
- The converter resolves unique tickers before update-mode deduplication, shows a resolution summary, and rebuilds the Wealthfolio CSV from the resolved transactions.
- `getWealthfolioSymbol` in `src/lib/sources/xtb/parser.ts` uses `metadata.resolvedSymbol` when present and otherwise falls back to `mapXTBSymbol`.

Privacy and limitations:
- Only ticker symbols and instrument names are sent to Wealthfolio market search; statement rows, amounts, account IDs, and balances remain local.
- The host search provider may not know both the old ticker and the new company name. Explicit aliases such as `K2H.PL -> FAB.WA` remain necessary for such cases.
- Search failures do not block conversion; unresolved symbols fall back to the report mapping.

## Weryfikacja importu IKE przez MCP (2026-11-08)

Zweryfikowano przez serwer MCP Wealthfolio (`search_activities`, `get_holdings`, `get_cash_balances`) względem lokalnych raportów XTB IKE (ALL do 2026-10-18 + UPDATE do 2026-10-21):

- Po deduplikacji po ID operacji XTB: 91 unikalnych operacji; konto IKE w Wealthfolio ma dokładnie 91 aktywności (`POSTED`, `sourceSystem=CSV`).
- Dopasowanie 1:1 dla wszystkich 91 wierszy: typ, symbol, znacznik czasu UTC (co do sekundy), ilość, cena jednostkowa, kwota, waluta i implicit FX z raportu.
- Typy: 20 DEPOSIT, 33 BUY, 3 SELL, 16 DIVIDEND, 19 INTEREST.
- Częściowe realizacje (np. `OPEN BUY 3/3.3251`) są zachowane jako osobne aktywności; dywidendy per pozycja również.
- Brak brakujących, nadmiarowych i zduplikowanych aktywności; brak `needsReview`.
- Gotówka: suma kwot z raportów zgadza się z saldem WF co do grosza; stan pośredni na 2026-10-18 odpowiada wierszowi `Total` raportu ALL.
- Holdingu: wszystkie 10 pozycji otwartych zgodne co do ilości; cost basis w walucie lokalnej zgodny z cenami otwarcia z raportu.
- Uwaga metadanych: ETF-y (CSPX/EIMI/CNDX) są zapisane jako `instrumentType=EQUITY`, choć raport oznacza je jako ETF.
- Anomalia pliku źródłowego: arkusz `Open Positions` w próbce ma inny numer konta w nagłówku niż `Cash Operations`; nie wpływa to na import.

Wniosek: dla zakresu objętego raportami import IKE jest kompletny i zgodny; nie trzeba go poprawiać.

## Weryfikacja importu konta Ojciec (XTB PLN) przez MCP (2026-11-08)

Zweryfikowano przez MCP (`search_activities`, `get_holdings`, `get_cash_balances`) względem lokalnych raportów XTB PLN (ALL do 2026-09-29 + UPDATE do 2026-11-02). Nie wykonano żadnych zapisów w Wealthfolio.

Skala i dopasowanie aktywności:
- 2434 surowe wiersze `Cash Operations`; po deduplikacji po ID operacji XTB: 1930 unikalnych wierszy.
- Po regułach parsera: 1928 oczekiwanych aktywności (m.in. splity i fractional SELL).
- W Wealthfolio: 2022 aktywności (`POSTED`, `sourceSystem=CSV`, brak `needsReview`).
- Dopasowano 1927/1928. Jedyny „brak” to fractional SELL ATO: w WF istnieje z poprawną ceną po FX (35.06), a nie naiwną 150.5; to nie jest rzeczywista rozbieżność.
- Zgodność typów: BUY 775, SELL 185, DIVIDEND 125, DEPOSIT 232, INTEREST 36, FEE 1, ADJUSTMENT 2, SPLIT 1.
- Rozbieżności typów: `TRANSFER_IN` +42, `TRANSFER_OUT` +42, `TAX` +10. Łącznie 94 nadmiarowe aktywności.

Zduplikowane importy (94 aktywności):
- 84 „nóg” transferów = 42 zduplikowane pary transferów (każda para to jedna noga IN i jedna OUT).
- 10 zduplikowanych wierszy TAX.
- Wszystkie nadmiarowe wpisy mają bliźniaka w WF oraz odpowiadający wiersz w raporcie; okno duplikacji: 2026-08-04 .. 2026-09-29 (przecięcie ALL i UPDATE).
- Duplikaty transferów są neutralne dla gotówki (IN i OUT się znoszą); duplikaty TAX zwiększają odpływ podatku.
- Przyczyna: deduplikacja w trybie update w `src/pages/converter-page.tsx` (`txKey` vs `activityKey`):
  - `txKey` używa `operationType` (`TRANSFER`, `TAX_WITHHOLDING`) i kwoty ze znakiem,
  - `activityKey` używa `activityType` (`TRANSFER_IN`/`TRANSFER_OUT`, `TAX`) i kwoty dodatniej,
  - dodatkowo transfery i podatki są inaczej klasyfikowane jako cash/trade.
  - BUY/SELL/DIVIDEND/DEPOSIT/INTEREST/ADJUSTMENT deduplikują się poprawnie.

Holdings:
- WF ma 37 papierów wartościowych; ich ilości zgadzają się z zagregowanym arkuszem `Open Positions` raportu UPDATE (m.in. FAB 13+3=16, CSPX 5+1.9239=6.9239).
- `SHELL` (1 szt. w raporcie) nie istnieje jako holding w WF. W `Cash Operations` są tylko dywidendy SHELL, brak wiersza zakupu/nabycia, więc parser nie może utworzyć pozycji. To ograniczenie danych raportu, nie błąd dopasowania.
- `ATO` po reverse splicie i fractional SELL wychodzi 0 szt.; brak holdingu w WF jest poprawny.
- Wiersze `ADJUSTMENT` dla KGH nie tworzą holdingu; zgodnie z raportem.

Gotówka:
- WF: trzy salda walutowe (PLN, USD, EUR); suma w PLN jest o ok. 167 PLN wyższa niż suma unikalnych wierszy raportów (ALL + część UPDATE po 2026-09-29).
- Zweryfikowany mechanizm: salda USD i EUR w WF są dokładnie równe sumie dywidend minus podatki u źródła dla papierów zagranicznych (bez wpływów z transakcji, które rozliczane są w PLN).
- Przyczyna: kolumna `Amount` w XTB jest już przeliczona na PLN, ale parser zapisuje ją jako kwotę w walucie instrumentu (`determineCurrency` po sufiksie tickera) dla `DIVIDEND` i `TAX_WITHHOLDING`; `fxRate` dla tych typów pozostaje pusty. To zawyża kwotę dywidendy/podatku oraz wyliczaną ilość (`amount / per-share`) i zaburza gotówkę oraz income.
- Naprawa (2026-11-08): w `src/lib/sources/xtb/parser.ts` dla `DIVIDEND`/`TAX_WITHHOLDING` wyznaczany jest FX per waluta (priorytet: pozycja/`derivedFxByPosition`, potem `openFx`/`closeFx`, potem najbliższa data z wierszy BUY/SELL, potem średnia, potem domyślny), a `amount` jest przeliczany `amount_pln / fx`; `fxRate` zapisywany. Dla dywidend `quantity = amount_pln / (fx * per-share)`.
- Naprawa FX transakcji (2026-11-08): dla `BUY`/`SELL` priorytet FX zmieniony na kurs wynikający z raportu (`Amount PLN / (qty×price)`), aby `amount (native) × fxRate` odtwarzało kwotę PLN z raportu i gotówka się zgadzała. `openFx`/`closeFx` pozostają fallbackiem. Status FX dla transakcji zmienia się z `verified` na `estimated` (cash-operations), gdy użyty jest kurs wynikający z raportu.
- Naprawa korekt dywidend (2026-11-08): dywidendy o ujemnej kwocie (`Amount < 0`, np. SHELL „corr …”) są konwertowane na `FEE` ze znakiem (Wealthfolio importuje dywidendy i korekty jako dodatnie kwoty, ale zachowuje znak opłat); dywidendy o kwocie 0 są pomijane.
- Naprawa deduplikacji update (2026-11-08): w `src/pages/converter-page.tsx` ujednolicono `txKey`/`activityKey` dla `TRANSFER` (mapowanie na `TRANSFER_IN`/`TRANSFER_OUT` po znaku kwoty, kwota bezwzględna) i `TAX_WITHHOLDING` (→ `TAX`, kwota bezwzględna); wyrównano klasyfikację cash/trade (transfery, podatki i opłaty jako cash). Ma to wyeliminować 94 duplikaty (84 nogi transferów + 10 TAX). Weryfikacja: `tsc --noEmit` i `vite build` przechodzą.
- Duplikaty TAX dodatkowo zwiększają odpływ gotówki; dokładne rozbicie różnicy wymaga historycznych kursów FX dla każdego wiersza.

Wnioski:
- Dopasowanie samych aktywności jest bardzo dobre; problemem są duplikaty z trybu update oraz obsługa walut dywidend/podatków.
- Priorytet naprawy: wspólny klucz deduplikacji dla transferów i podatków; następnie FX dla dywidend/podatków; na końcu ręczne uzupełnienie brakującego nabycia SHELL lub zaakceptowanie braku pozycji.

## mBank eMakler sample analysis (2026-11-11)

Verified from local samples in `local-samples/mBank eMakler/` (not committed):

- Files are CP1250, semicolon-delimited, with a metadata block before the table.
- Dates use `DD.MM.YYYY HH:mm:ss`; decimals use comma; thousands use spaces.
- `eMAKLER_historia_transakcji_YYYY.Csv` columns:
  `Czas transakcji;Papier;Giełda;K/S;Liczba;Kurs;Waluta;Prowizja;Waluta;Wartość;Waluta`.
- `eMAKLER_historia_finansowa_YYYY.Csv` columns:
  `Data;Opis;Kwota`, with dividend rows containing an extra empty field before the amount.
- Transaction side `K` = buy, `S` = sell.
- Trade currency can be `USD` while total `Wartość` is `PLN`; implicit FX = `Wartość / (Liczba * Kurs)`.
- Financial history contains dividends, IKZE deposits, savings-to-investment deposits, sell settlements (`WYC`),
  and cash reservation/release rows (`Blokada`, `Odblokowanie`).
- No `Zlecenia` or `Zapisy` sample is available in the provided directory.
- Detailed format notes: `docs/sources/mbank-emakler-analysis.md`.

## mBank eMakler adapter implementation (2026-11-11)

Implemented:
- `src/lib/sources/mbank/` parser and report converter for the `emakler` subtype.
- CP1250 decoding and metadata/header-row detection.
- Transaction report parsing into BUY/SELL with implicit FX rates.
- Financial history parsing into DIVIDEND/DEPOSIT and skipping WYC/Blokada/Odblokowanie settlement rows.
- Wealthfolio CSV generation through the shared builder, with fee support from transaction metadata.
- UI source selector now enables mBank and shows an eMakler subtype selector.
- Synthetic parser tests in `src/lib/sources/mbank/parser.test.ts` and fixtures in `tests/fixtures/mbank/`.
- CSV reader helpers `readTextFile` and `findCsvHeaderIndex`.

Verified:
- `./node_modules/.bin/tsc --noEmit` passes.
- `./node_modules/.bin/vitest run` passes (9 tests).
- `./node_modules/.bin/vite build` passes.

Known limitations:
- Only `emakler` subtype is implemented; Zlecenia and Zapisy reports are not yet handled.
- mBank instrument codes are not mapped to standard tickers; market resolution may be needed.
- Dividend amounts are treated as paid amounts; gross/net tax status is not verified.
- Node 18.19.1 is below Vite's recommended version; tests require a File polyfill in this environment.

## mBank ticker mapping (2026-11-11)

- Added `src/lib/sources/mbank/symbol-map.ts` with explicit aliases for mBank eMakler instrument codes.
- Parser now stores `metadata.resolvedSymbol` using these aliases, so Wealthfolio CSV/import uses the mapped ticker.
- Conversion now also invokes the host market ticker resolver for unresolved codes.
- Known aliases include PKNORLEN->PKN.WA, ORANGEPL->OPL.WA, PGE->PGE.WA, PHOTON->PEN.WA, MBANK->MBK.WA, MODIVO->MDV.WA, CDPROJEKT->CDR.WA, CYFRPLSAT->CPS.WA, ASSECOPOL->ACP.WA, XTB->XTB.WA, BIOCELTIX->BCT.WA, RBOT LN ETF->RBOT.L, SPY5 LN ETF->SPY5.L.

## mBank cash balance fix (2026-11-11)

- mBank transaction rows are no longer deduplicated by generated ID within a file, because
  identical rows can represent separate executions and mBank provides no source ID.
- Fees for non-PLN trades are now folded into the trade amount/unit price instead of being
  passed as a separate fee in the activity currency, avoiding FX conversion of PLN fees.
- Expected net cash for the provided mBank samples remains 9.03 PLN.

## mBank PLN value rounding fix (2026-11-11)

- For PLN trades, the unit price is now derived from the report's `Wartość` when it differs
  from `Liczba * Kurs`, so Wealthfolio's cash impact matches the report value.
- This addresses the CYFRPLSAT row where `35 * 12.70` and the reported `Wartość` differ.
