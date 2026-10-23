# XTB Initial Import Mode Analysis (sanitized)

## Report variant

File suffix `-ALL` represents a full account history report. It contains three sheets:
- `Closed Positions`
- `Cash Operations`
- `Open Positions`

## Sheet roles

### Cash Operations

- Primary source for Wealthfolio activities.
- Header row 5 (0-based index 4), data from row 6 (index 5).
- Columns: Type, Instrument, Ticker, Category, Time, Amount, ID, Comment, Product, Position ID.
- Operation types in the full-history sample: `IKE deposit`, `Free funds interest`, `Dividend`, `Stock purchase`, `Stock sell`, `Total`.
- `Total` is a summary row and must be skipped.
- Cash operations include deposits, interest, dividends, buys, and sells.
- Partial fills use `numerator/denominator` notation in `Comment`.

### Closed Positions

- Contains completed trades with open/close prices and realized profit/loss.
- Header row 5 (0-based index 4), data afterward.
- Useful for validation and realized-gain cross-checks.
- Not required as a separate Wealthfolio activity source if sells are already represented in Cash Operations.

### Open Positions

- Contains current holdings and lot-level details.
- Includes summary rows and per-lot rows.
- Useful for holdings validation and snapshots, but not the primary activity import source.

## Initial mode implications

- Import the full date range from Cash Operations.
- One Wealthfolio activity row should be generated per supported cash operation.
- Open/closed position sheets can be used for validation, duplicate detection, and future holdings snapshot support.
- Dividend rows may reference a position ID or be standalone cash events.
- Sell rows correspond to closed-position lots and should be matched by position ID where possible.
