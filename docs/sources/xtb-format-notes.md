# XTB Report Format Notes (sanitized)

## Workbook sheets

- `Closed Positions`
- `Cash Operations`
- `Open Positions`

## Cash Operations sheet

- Rows 1-4 contain account metadata, report title, and date range.
- Row 5 is the header row.
- Data starts at row 6.
- Header columns:
  1. Type
  2. Instrument
  3. Ticker
  4. Category
  5. Time (Excel serial date/time)
  6. Amount
  7. ID
  8. Comment
  9. Product
  10. Position ID

## Observed operation types

- `Stock purchase`
- `Stock sell`
- `IKE deposit`
- `Deposit`
- `Free funds interest`
- `Dividend`
- `Total` (summary row; must be skipped)

## Notes

- Buy/sell quantity and unit price are embedded in `Comment`, e.g. `OPEN BUY KRU.PL 3 @ 351.00`.
- Partial fills use `numerator/denominator` notation in comments.
- Ticker suffix mapping to Wealthfolio symbols: `.PL` -> `.WA`, `.UK` -> `.L`.
