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

## 2026-11-06 — Represent XTB fractional-share split payouts as SPLIT + SELL
- XTB records reverse splits as `Fractional shares` with a comment `split <new> for <old>`.
- Rationale: Wealthfolio expects `SPLIT` with the split ratio in `amount`, not a cash adjustment.
- Consequence: Parser emits a `SPLIT` row (subtype `REVERSE_SPLIT` when ratio < 1) plus a `SELL` for the fractional remainder paid in cash.
- Holdings are replayed in chronological order because XTB Cash Operations rows are newest-first.
- The fractional SELL unit price is derived from the payout amount, the position FX rate, and the sold quantity.
- Update-only reports without historical buys cannot reliably size the fractional SELL.

## 2026-11-06 — Map renamed WSE tickers to their current Yahoo symbols
- `CCC.PL` -> `MDV.WA` (Modivo S.A., renamed from CCC S.A. in February 2026).
- `K2H.PL` -> `FAB.WA` (Fabrity S.A., renamed from K2 Holding S.A. in August 2023).
- Rationale: Wealthfolio resolves the current Yahoo symbol; old XTB tickers no longer match a quote provider symbol.
- Consequence: Historical rows using the old ticker are grouped with the current asset, preserving one continuous position.
- Later superseded by search-assisted resolution; keep explicit aliases as deterministic/offline fallbacks.

## 2026-11-09 — Reconcile only promotional open-position lots
- Reconciliation emits `ADJUSTMENT` only for open lots whose open price is greater than 0 and at most 0.01 (e.g. SHELL promotion at 0.0001).
- Rationale: normal open lots without a cash buy are often covered by another report file (date-range mismatch) and must not be duplicated as adjustments.
- Consequence: genuine missing positions with normal cost basis are not auto-reconciled; they require manual review.

## 2026-11-06 — Search renamed tickers through the host market API
- Rationale: Hardcoded aliases do not scale to future ticker changes.
- Implementation: exact mapped symbol first; if missing, search ISIN/base ticker/instrument name via `ctx.api.market.searchTicker`.
- Conservative matching only: require the expected exchange suffix and currency, then accept an exact symbol or a normalized-name match. Ambiguous results are not applied.
- Consequence: Adds the `market-data` / `searchTicker` permission and can add network latency on conversion.
- Privacy: only tickers and instrument names are queried; full statements and financial data stay local.
- Fallback: the explicit alias map remains for known renames and for offline/search failures.

## 2026-11-11 — mBank will be a source with an eMakler subtype

- Decision: model mBank as a report source with a subtype selector; first and currently only subtype is `eMakler`.
- Rationale: mBank has multiple systems/report styles; the subtype keeps future mBank formats from overloading one parser.
- Consequence: UI must show the subtype selector only when `mBank` is selected; mBank remains disabled until the eMakler adapter and tests are complete.
- Financial-history rows that duplicate trade cash effects (`WYC`) and internal reservations (`Blokada`/`Odblokowanie`) should not become separate Wealthfolio activities.
