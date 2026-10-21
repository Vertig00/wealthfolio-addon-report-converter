# Product Specification

## Goal

Make it easier to import investment activity into Wealthfolio by converting broker-exported CSV/XLSX statements.

## Main user journey

1. The user opens the addon.
2. The user selects a source — XTB initially.
3. The user uploads a CSV or XLSX file.
4. The addon inspects the file and displays a preview.
5. The user reviews mappings, errors, warnings, and unsupported records.
6. The addon generates an output file confirmed to match a format supported by Wealthfolio.
7. The user downloads the result or, in a later phase, starts a direct import into a selected Wealthfolio account.

## Version 1 scope

### Required
- CSV and XLSX support.
- Source selector with XTB as the first supported provider.
- Worksheet selection for workbooks with multiple sheets.
- File preview without modifying the original file.
- Normalization into a broker-independent internal model.
- Validation of operation type, dates, quantities, prices, currencies, and amounts.
- Clear errors tied to source row numbers.
- Downloadable output in a format verified as supported by the current Wealthfolio version.
- Handling of empty, malformed, and unsupported files.
- Local processing; do not upload statements to external services.
- Polish and English GUI, designed to support more locales later.

### Out of scope for the first stage
- Logging in to broker accounts.
- Fetching data from broker APIs.
- Automatic scheduled synchronization.
- Supporting every broker.
- Writing transactions automatically without preview and user confirmation.

## Direct import — a later phase

Implement direct import only after verifying the current official Wealthfolio SDK/API and its import model. Requirements:
- choose a target Wealthfolio account;
- show the number of records that will be added;
- use Wealthfolio validation if available;
- handle duplicates;
- require explicit user confirmation;
- summarize imported, skipped, and rejected records.

## UX and GUI requirements

The interface should feel like a small, guided workflow rather than a raw data utility. Use clear steps, useful empty states, progress/loading states, validation summaries, and a review table. Keep destructive or account-changing actions behind a confirmation step. Follow the host app's design conventions where the SDK permits.

## Quality requirements

- Preserve numeric precision and monetary values.
- Do not convert blank cells to zero without a justified rule.
- Preserve dates and currencies according to the source and destination requirements.
- Do not confuse deposits/withdrawals with buys/sells, or dividends with other cash inflows.
- Do not guess the meaning of unknown operation types.
- Warn about ambiguous mappings.
- Test the parser with synthetic examples and edge cases.
- Verify Polish and English translations and the fallback behavior.
