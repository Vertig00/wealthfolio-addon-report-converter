# Next Session

## Completed in this session

- Created missing persistent context files.
- Documented XTB Cash Operations structure.
- Updated XTB parser to skip `Total` rows, parse quantity/price from comments, map symbols, and generate Wealthfolio CSV.
- Updated converter UI to download parser-generated Wealthfolio CSV.
- Ran `tsc --noEmit` and `vite build` successfully.

## Current status

Stage 1 mostly complete; Stage 2/3 partially complete; Stage 4 in progress.

## Next recommended steps

1. Create synthetic XTB fixtures and parser tests (no test runner currently configured).
2. Verify buy/sell partial-fill handling against Wealthfolio import behavior.
3. Implement validation diagnostics and row-level error reporting in the UI.
4. Add locale-aware formatting and complete i18n key coverage.
5. Only then consider direct Wealthfolio import (Stage 5).

## Blockers

- No test framework is installed; add one before claiming parser correctness.
- Node 18.19.1 is below Vite's recommended version.

## Analysis added

- Documented initial import mode and all three XTB sheets in `docs/sources/xtb-initial-import-analysis.md`.

## Implemented

- Initial mode now passes selected mode to parser.
- Dividend quantity and unit price are derived from `amount / per-share` when comment contains `x.xx/ SHR`.

## Release setup added

- Added GitHub Actions release workflow and `docs/RELEASING.md`.
- GitHub CLI is not installed; release publishing must be verified through GitHub UI or installed later.
- No release or tag was published.

## Update mode analysis added

- Documented overlap and ID-based deduplication in `docs/sources/xtb-update-import-analysis.md`.
- No update-mode implementation yet.

## Direct import analysis added

- Documented SDK-based initial import flow in `docs/sources/xtb-direct-import-analysis.md`.
- No direct import implementation yet.

## Current update (this session)

- Re-enabled update mode in the source selector.
- Verified update-mode deduplication against local XTB samples: 4 new operations out of 6 in the update report.
- Disabled direct Wealthfolio import while in update mode, because append/import behavior is not implemented yet.
- `tsc --noEmit` and `vite build` pass.

## Reverse split support (2026-11-06)

- Added XTB `Fractional shares` reverse-split detection (`split <new> for <old>`).
- Emits Wealthfolio `SPLIT` (ratio in `amount`, `REVERSE_SPLIT` subtype) and a fractional `SELL`.
- Replays holdings chronologically because Cash Operations rows are newest-first.
- Verified against the local ATO.FR sample: ratio `0.0001`, post-split quantity `0.38`, fractional SELL priced from the cash payout and position FX.
- `tsc --noEmit` and `vite build` pass.
- Next: add a synthetic XTB fixture and parser test once a test runner is configured; consider update-mode migration for previously imported `Fractional shares` adjustments.

## WSE ticker alias fix (2026-11-06)

- Added `mapXTBSymbol` with explicit aliases: `CCC.PL` -> `MDV.WA`, `K2H.PL` -> `FAB.WA`.
- UI update-mode deduplication now uses the same shared mapping.
- Verified on the local sample: CCC and K2H/FAB rows now output `MDV.WA` and `FAB.WA`.
- `tsc --noEmit` and `vite build` pass.

## General ticker search (2026-11-06)

- Added `src/lib/market/ticker-resolver.ts` using `ctx.api.market.searchTicker`.
- Resolution runs before update-mode deduplication and before CSV export, so preview, download, and import use the resolved symbols.
- Added the `market-data` / `searchTicker` permission to `manifest.json`.
- Added a UI summary for updated, unresolved, and failed ticker lookups, with a privacy note.
- Kept explicit aliases as deterministic/offline fallbacks.
- Manually exercised the resolver with synthetic search results: exact match, name-based rename, ambiguity, wrong-market rejection, not-found, and API error cases.
- `tsc --noEmit` and `vite build` pass.
- Next: add a real test runner and commit synthetic resolver tests; verify `searchTicker` behavior against a real Wealthfolio host for `.WA` results.

## Weryfikacja importu IKE przez MCP (2026-11-08)

- Sprawdzono konto IKE przez MCP Wealthfolio względem raportów XTB ALL + UPDATE.
- Wynik: 91/91 operacji zgodnych 1:1 (typ, symbol, czas UTC, ilość, cena, kwota, waluta, FX), 0 braków, 0 duplikatów, 0 nadmiarowych.
- Gotówka i wszystkie 10 holdings zgodne z raportem; brak `needsReview`.
- Szczegóły w `docs/PROJECT_CONTEXT.md` (sekcja „Weryfikacja importu IKE przez MCP”).
- Następny krok: użyć MCP `prepare_activity_import` do walidacji wierszy generowanych przez addon przed importem; nadal brak test runnera.

## Weryfikacja importu konta Ojciec (XTB PLN) przez MCP (2026-11-08)

- Sprawdzono konto Ojciec (XTB PLN) przez MCP Wealthfolio względem raportów ALL + UPDATE.
- 1927/1928 oczekiwanych aktywności dopasowanych; jedyny „brak” to fractional SELL ATO z poprawną ceną po FX.
- Wykryto 94 zduplikowane aktywności z okna 2026-08-04..2026-09-29: 42 pary transferów (84 nogi) + 10 TAX.
- Przyczyna duplikatów: `txKey`/`activityKey` w `src/pages/converter-page.tsx` używają różnych nazw typów i znaków kwot dla `TRANSFER*` i `TAX*`.
- Holdings: 37 papierów zgodnych ilościowo; brakuje `SHELL` 1 szt., bo raport nie zawiera wiersza nabycia (tylko dywidendy).
- Gotówka: brak pełnej zgodności (WF wyżej o ok. 167 PLN). Salda USD/EUR w WF równają się dokładnie sumie dywidend minus podatki; parser zapisuje kwoty PLN jako walutę instrumentu dla `DIVIDEND`/`TAX_WITHHOLDING`.
- Szczegóły w `docs/PROJECT_CONTEXT.md` (sekcja „Weryfikacja importu konta Ojciec”).
- Następne kroki:
  1. Ujednolicić deduplikację update: mapować `TRANSFER` -> `TRANSFER_IN/OUT`, `TAX_WITHHOLDING` -> `TAX`, używać kwot dodatnich i tej samej klasyfikacji cash/trade.
  2. Dodać testy jednostkowe na duplikaty transferów i podatków (syntetyczne dane).
  3. Naprawić walutę i kwotę dywidend/podatków (FX lub przeliczenie z per-share × liczba sztuk).
  4. Po zgodzie użytkownika usunąć 94 duplikaty przez MCP i zweryfikować gotówkę.
  5. Zdecydować, co zrobić z brakującym holdingiem SHELL.
