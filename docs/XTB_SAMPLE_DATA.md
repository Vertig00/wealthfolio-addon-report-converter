# Analyzing a Real XTB Report

## Purpose

Inspect a real report before implementing the parser. Report layouts may vary by export version, language, date range, worksheet count, and activity types.

## Where to place a sample

Place the file locally in the project, for example:

- `local-samples/xtb/xtb-report-sample.xlsx`
- `local-samples/xtb/xtb-report-sample.csv`

The `local-samples/` directory must be excluded from Git. Do not use a filename containing a person's name, client number, or other identifying data.

## Agent instructions

When a user makes a local report available, the agent may analyze it locally, within the environment's permissions. The agent should:
1. identify the file type, CSV encoding, delimiter, and number format;
2. for XLSX, list worksheet names, dimensions, headers, and section layout;
3. identify header rows, operation types, blank rows, and report sections;
4. describe column meanings and explicitly mark uncertain interpretations;
5. inspect dates, currencies, decimal formats, signs, and formulas where relevant;
6. identify cases that cannot be mapped unambiguously;
7. propose parser behavior and tests;
8. avoid printing account details, names, addresses, identifiers, balances, or complete transaction values in its response.

## Privacy

Prefer a copy where:
- identifying details and account numbers are removed or replaced;
- monetary values are synthetic when real values are not needed to identify the structure;
- column names, worksheet layout, cell types, delimiters, and date formats are preserved;
- important edge cases remain represented.

Removing only a name and account number may not be sufficient anonymization. Transaction history itself can be sensitive.

## Expected outputs from analysis

Create or update:
- `docs/sources/xtb-format-notes.md` — a description of the structure without sensitive values;
- `tests/fixtures/xtb/` — synthetic or anonymized fixtures;
- parser tests covering every identified operation type and edge case.

Do not copy the real file into test fixtures, Git, or commits.
