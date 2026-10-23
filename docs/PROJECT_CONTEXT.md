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
