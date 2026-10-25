# XTB Direct Import Analysis (not implemented)

## SDK capabilities verified

- `ctx.api.accounts.getAll()` returns Wealthfolio accounts.
- `ctx.api.activities.getAll(accountId)` returns existing activities for an account.
- `ctx.api.activities.saveMany({ deleteIds })` can delete existing activities.
- `ctx.api.activities.checkImport(activities)` validates activities before import.
- `ctx.api.activities.import(activities)` imports activities and returns a summary.
- `ctx.api.storage` can store per-addon checkpoints.

## Proposed initial import flow

1. User selects a target Wealthfolio account.
2. User uploads and converts an XTB report.
3. User reviews parsed rows.
4. User clicks "Import to account".
5. For initial mode, show a confirmation dialog stating that all existing activities in the selected account will be deleted.
6. If confirmed:
   - load existing activities for the account;
   - delete them with `saveMany({ deleteIds })`;
   - map converted XTB operations to `ActivityImport` objects;
   - validate with `checkImport`;
   - import with `activities.import`;
   - show imported/skipped/failed counts.
7. Store imported operation IDs for future update-mode deduplication.

## Mapping notes

- `activityType`: XTB operation type.
- `accountId`: selected account.
- `date`: transaction date.
- `symbol`: Wealthfolio-mapped symbol.
- `instrumentType`: category-based hint.
- `quantity`, `unitPrice`, `amount`, `currency`, `fee`, `tax`, `fxRate`: from canonical transaction.
- `sourceSystem`: `XTB`.
- `sourceRecordId`: XTB operation ID for traceability and duplicate detection.

## Risks and open questions

- Clearing an account is destructive and requires explicit confirmation.
- Asset resolution behavior during `import` must be tested with safe data.
- Update mode is currently disabled until deduplication is reliable.
- No account-writing functionality should be exposed until this flow is implemented and tested.
