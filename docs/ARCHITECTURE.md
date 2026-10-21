# Proposed Architecture

## Principle

Keep broker input formats separate from Wealthfolio output formats. Adding a provider such as mBank should require a new adapter, not a rewrite of the entire application.

## Data flow

```text
CSV/XLSX
   ↓
File reader (file format)
   ↓
Source adapter (XTB)
   ↓
Canonical transaction model
   ↓
Validation + diagnostics
   ↓
GUI preview / user review
   ↓
Wealthfolio exporter (download)
   └── later: Wealthfolio API importer
```

## Suggested modules

These names are proposals. Inspect the existing scaffold and adapt without unnecessary restructuring.

- `src/lib/file-readers/` — CSV/XLSX reading, encoding, delimiters, worksheets.
- `src/lib/sources/xtb/` — parser and mapping for known XTB report variants.
- `src/lib/sources/` — common source-adapter interfaces.
- `src/lib/domain/` — broker-independent operation model.
- `src/lib/validation/` — validation rules and diagnostics.
- `src/lib/exporters/wealthfolio/` — output generation.
- `src/lib/importers/wealthfolio/` — future official API integration.
- `src/components/` — upload, source selection, preview, errors, and confirmation UI.
- `src/locales/` — translations, if compatible with the scaffold's conventions.
- `tests/fixtures/` — synthetic test data.
- `local-samples/` — local broker reports excluded from Git.

## Canonical model

Design the internal model after examining a real report and confirming Wealthfolio's requirements. Consider distinct types for:
- buys and sells;
- dividends and tax withholding;
- cash deposits and withdrawals;
- fees and commissions;
- transfers;
- unknown/unmapped operations.

Do not use a generic record that erases meaningful distinctions between operations. Do not assume every row in an XTB statement is an activity that should be imported as a trade.

## Source adapter

Each adapter should:
1. declare the report variants it supports;
2. recognize expected headers/sections;
3. parse records into the canonical model;
4. report errors and warnings with source row references;
5. never write to Wealthfolio;
6. have tests based on fixtures.

## Security and privacy

- Parse files client-side where possible.
- Do not upload statements to external services.
- Avoid storing statement contents in localStorage or logs without a clear need.
- Keep real reports in a local directory excluded from Git.
- Treat worksheet names, headers, and cell contents as untrusted input.
