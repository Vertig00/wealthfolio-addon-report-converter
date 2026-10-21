# Test fixtures

Fixtures committed to the repository must be synthetic or carefully anonymized. Never use real broker statements as committed fixtures.

Suggested layout:
- `tests/fixtures/xtb/` — synthetic samples for confirmed XTB report variants.
- `tests/fixtures/mbank/` — future samples for mBank.

Fixtures should preserve relevant structural properties:
- headers and column order;
- worksheet count and section layout;
- date, number, and currency formats;
- empty fields and edge cases;
- different operation types.

Use fictional values, names, and identifiers. Tests should assert parsing results, validation behavior, and error diagnostics.
