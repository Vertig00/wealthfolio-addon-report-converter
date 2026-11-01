# Wealthfolio Report Converter

Wealthfolio Desktop addon that converts broker statements in CSV/XLSX format into a Wealthfolio-compatible activity file.

## Current support

- Report source: XTB (CSV/XLSX).
- Reads XTB `Cash Operations` data and maps supported operations to Wealthfolio activities.
- Supports initial and update import modes.
- Preview, validation summary, and downloadable Wealthfolio CSV output.
- Direct import into a selected Wealthfolio account with confirmation.
- Polish and English UI.

## Development

```bash
pnpm install
pnpm run type-check
pnpm run build
pnpm run package
```

## Usage

1. Open the addon in Wealthfolio.
2. Select a target account.
3. Choose the report source and upload an XTB CSV/XLSX file.
4. Review the parsed preview and validation summary.
5. Download the converted file or import it into the selected account.

## Privacy

Broker statements may contain sensitive financial data. Processing is local. Do not commit real broker statements, screenshots, or personal data to Git.
