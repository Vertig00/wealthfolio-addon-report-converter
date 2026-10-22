# Decisions

## 2026-10-22 — Keep canonical transaction model separate from Wealthfolio CSV export
- Rationale: Preserve broker-independent data and allow future providers.
- Consequence: XTB-specific parsing stays in `src/lib/sources/xtb`.

## 2026-10-22 — Use local Wealthfolio activities sample as format reference
- Evidence: `local-samples/wealthfolio/wealthfolio_activities_v2.csv`.
- Consequence: Parser output targets the verified CSV header and field order.

## 2026-10-22 — Generate one Wealthfolio row per supported XTB operation
- Rationale: Simpler and matches required import fields (`symbol`, `quantity`, `price`, `date`, `type`).
- Consequence: Amount is left blank for buy/sell rows; Wealthfolio can derive it from quantity and price.

## 2026-10-22 — Map XTB tickers to Wealthfolio symbols
- `.PL` -> `.WA`, `.UK` -> `.L`.
- Rationale: Verified against local Wealthfolio sample.
