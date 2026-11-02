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
- Dividend tax withholding and fee mapping are not yet represented.
- Direct Wealthfolio import (Stage 5) is not implemented.

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
