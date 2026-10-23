# AGENTS.md — Wealthfolio Statement Importer

## Project goal

Build a Wealthfolio Desktop addon that converts broker statements in CSV/XLSX format into a format supported by Wealthfolio.

The user should be able to:
1. Upload a CSV or XLSX file.
2. Select the report source — XTB first.
3. Review parsed transactions, warnings, and errors in a graphical user interface (GUI).
4. Download an output file confirmed to be compatible with Wealthfolio.
5. In a later phase, initiate an import directly into a selected Wealthfolio account.

The architecture must support additional future providers, such as mBank, without rewriting the whole addon.

## Agent working rules

- Read this file, `README.md`, and all relevant files in `docs/` before changing code.
- Inspect the existing project structure, `package.json`, build configuration, manifest, and the actually installed Wealthfolio SDK version first.
- Preserve conventions from the official Wealthfolio addon scaffold. Do not replace the build setup or manifest without a clear reason.
- Never invent SDK method names, import schemas, or CSV fields. Verify them against installed types, examples, and current documentation.
- Separate file reading, provider-specific parsing, normalized data, validation, export, and Wealthfolio integration.
- Support CSV and XLSX. Do not assume all CSV files use commas, UTF-8, or a header row at line one.
- Do not assume all XTB reports have identical layouts. Detect known variants and report ambiguity instead of silently guessing.
- Do not write transactions to Wealthfolio without an explicit user action. Show a review/confirmation step first.
- Never send broker statements or financial data to external services. Process files locally unless the project owner explicitly approves a different design.
- Do not log report contents, personal information, account identifiers, balances, or full transactions. Logs should contain only technical details needed for debugging.
- Never commit real user statements to Git, tests, screenshots, prompts, or documentation.
- Before adding fixtures to Git, verify that they are synthetic or carefully anonymized.
- Run available tests, type checks, lint, and build commands after changes. If a command does not exist, report that instead of inventing it.
- Make small, focused changes. Do not delete files or change dependencies without a clear reason.
- At the end of each task, report changed files, decisions, test results, limitations, and the next recommended step.

## Product priorities

### Version 1 — XTB parsing and downloadable export
- CSV/XLSX upload.
- Source selector, initially supporting XTB.
- A clear GUI for file selection, source selection, preview, validation, and export.
- Sheet selection when an XLSX has multiple worksheets.
- Parse supported XTB report variants into a broker-independent internal data model.
- Validation and row-specific errors/warnings.
- Download an output file in a format verified to be compatible with Wealthfolio.
- Do not write to a Wealthfolio account in this first phase unless explicitly scoped and verified.

### Version 1.x — direct import
- Select a Wealthfolio account.
- Validate using the official API, if supported.
- Handle duplicates and partial failures.
- Require explicit user confirmation before writing.
- Show an import summary.

### Future providers and features
- Add mBank and other providers as separate source adapters.
- Reuse the common data model, validation, and Wealthfolio exporter/importer.
- Do not put provider-specific parsing logic in UI components.

## GUI requirements

The addon is a user-facing product, not just a parser library. Build a clear, accessible GUI consistent with the host app and the official addon SDK.

The primary workflow should be easy to understand:
1. Choose report source.
2. Upload CSV/XLSX.
3. Select worksheet if needed.
4. Review parsed data and diagnostics.
5. Download the converted file, or later continue to direct import.

Include:
- clear labels, instructions, empty states, loading states, and error states;
- an understandable transaction preview table;
- row-level validation messages and a summary of valid, warning, and invalid records;
- accessible keyboard navigation and visible focus states;
- responsive layout suitable for the host application window;
- confirmation before irreversible or account-changing actions;
- no success messages until the operation actually succeeds.

Do not hard-code user-facing strings in components. Use the localization system described below.

## Localization / internationalization (i18n)

The GUI must support **Polish (`pl`) and English (`en`) in the first release**, and be designed to add more languages later.

- Use a consistent i18n approach compatible with the existing scaffold. Inspect dependencies and project conventions before choosing or adding a library.
- Keep translations in separate locale files, e.g. `src/locales/en.json` and `src/locales/pl.json`, or an equivalent structure appropriate to the project.
- All user-facing text must use translation keys: navigation, headings, buttons, labels, hints, empty states, validation messages, errors, dialogs, import summaries, and accessibility labels.
- Avoid embedding English or Polish copy directly in UI components.
- Use English as the fallback locale if a translation key is missing.
- Provide a language selector in the addon's GUI unless the host app exposes a reliable locale that can be used consistently. If the host locale is used, document the behavior and provide an override if feasible.
- Store language preference only if there is an appropriate existing persistence mechanism; do not introduce unnecessary storage.
- Use locale-aware date, number, and currency formatting. Do not use localized display strings as internal values.
- Keep translation keys stable and descriptive. Document how to add a new locale.
- Ensure the layout handles longer translated strings without clipping.
- Add tests that check locale loading, fallback behavior, and key coverage for Polish and English.

## Required data flow

`CSV/XLSX → file reader → provider adapter (XTB) → canonical model → validation → GUI review → Wealthfolio exporter or, later, official import API`

Do not connect the XTB parser directly to UI components or persistence methods.

## Before implementing direct import

1. Verify the current official SDK/API capabilities and limitations.
2. Confirm the required import data shape using installed types and current documentation.
3. Document how each supported XTB operation maps to Wealthfolio.
4. Add tests using synthetic data.
5. Handle duplicates and ambiguous records.
6. Only then expose account-writing functionality with explicit confirmation.

## Project documentation

- `docs/PRODUCT_SPEC.md` — product scope and requirements.
- `docs/ARCHITECTURE.md` — module boundaries and data flow.
- `docs/I18N.md` — language support and translation rules.
- `docs/XTB_SAMPLE_DATA.md` — safe process for analyzing a real XTB report.
- `docs/IMPLEMENTATION_PLAN.md` — stages and completion criteria.
- `local-samples/README.md` — location for local, uncommitted broker reports.
- `tests/fixtures/README.md` — rules for test fixtures.

## Definition of done

A task is not complete merely because the code looks plausible. Relevant tests and available quality checks must pass. Do not claim Wealthfolio compatibility until the output format has been verified against current documentation/SDK and tested.

## Persistent Project Context and Session Continuity

The project documentation is the persistent source of truth across agent sessions. Do not rely on conversation history alone.

### Required context files

Maintain these files:

- `docs/PROJECT_CONTEXT.md` — current project facts, verified findings, constraints, open questions, and important discoveries.
- `docs/DECISIONS.md` — significant technical and product decisions, including rationale and consequences.
- `docs/NEXT_SESSION.md` — current progress, unfinished work, blockers, and the next recommended actions.

Create these files if they do not exist.

### At the start of each session

1. Read `AGENTS.md`.
2. Read the relevant project documentation, including all three context files above.
3. Inspect the current Git state and relevant source files before assuming previous work is still present.
4. Verify important facts against the actual code, installed dependencies, SDK types, and available documentation.
5. Identify inconsistencies between documentation and the current implementation.

### During work

Update persistent context when discovering information that will be useful in future sessions, including:

- verified XTB or other broker report formats;
- mappings from broker columns to the canonical transaction model;
- date, number, currency, fee, tax, and transaction-type parsing rules;
- Wealthfolio SDK capabilities and verified integration constraints;
- architectural decisions and their rationale;
- recurring bugs, edge cases, and successful solutions;
- testing requirements and known limitations.

Distinguish verified facts from assumptions and unresolved questions. Record evidence or the relevant file path when useful.

Do not save every conversational detail. Save concise, durable, project-relevant information.

### Before ending a session

1. Update `docs/PROJECT_CONTEXT.md` if important facts changed.
2. Add significant decisions to `docs/DECISIONS.md`.
3. Update `docs/NEXT_SESSION.md` with completed work, current status, blockers, and the next concrete steps.
4. Ensure documentation matches the actual code.
5. Summarize the changes and identify anything that still requires user input.

### Safety and correctness

- Never record passwords, API keys, access tokens, or other secrets in project context.
- Never copy private financial report data or personally identifying information into general documentation.
- Use synthetic or anonymized examples when documenting broker formats.
- Do not claim that a fact is verified unless it has been checked.
- Do not overwrite user decisions or delete historical decisions without a clear reason.
- Keep context concise, structured, and useful for future sessions.
- Do not claim that changes were saved unless the files were actually written successfully.

## Git, GitHub, Commits and Releases

The user controls when commits, pushes, and releases are created. Never perform these actions automatically without an explicit request in the current conversation.

### Before creating a commit

When the user asks to create a commit:

1. Inspect `git status` and review all changes using `git diff`.
2. Check for accidental inclusion of real financial reports, personal information, secrets, credentials, generated files, or unrelated changes.
3. Run the relevant tests, lint checks, type checks, and build commands available in the project.
4. Fix issues caused by the current changes when appropriate. If important checks fail, explain why and do not create the commit without discussing the failure.
5. Stage only the intended files. Never blindly stage everything with `git add .`.
6. Create a concise commit message that describes the actual changes.
7. Verify the resulting commit and report its hash and the checks performed.

### Before pushing to GitHub

Only push when the user explicitly asks to publish or push the changes.

1. Verify the current branch and configured remote.
2. Check whether the remote contains changes that are not present locally.
3. Never force-push, rewrite shared history, or overwrite remote changes without explicit authorization.
4. Push only the intended branch and commits.
5. Report the destination branch and the result.

If GitHub authentication or repository configuration is missing, explain what needs to be configured. Never ask the user to paste passwords, tokens, or private keys into the conversation.

### Before creating a release

Only create a GitHub Release when the user explicitly requests a release or confirms the proposed release plan.

1. Inspect the latest release, existing tags, and project version.
2. Propose a version number using semantic versioning unless the user specifies one.
3. Review the changes since the previous release.
4. Run available quality checks and verify that the release can be built.
5. Update the version and release documentation where appropriate.
6. Prepare release notes describing actual changes, fixes, and known limitations.
7. Create the appropriate version tag and publish the GitHub Release only after the user's explicit request.
8. Never overwrite an existing tag or release without explicit authorization.
9. Report the version, tag, commit, test results, and release URL.

### General rules

- Never claim that a commit, push, tag, or release succeeded unless its success has been verified.
- Keep the working tree and release history understandable.
- Never commit real broker statements or sensitive financial data.
- Prefer small, logically grouped commits.
- If the user says "commit", create a local commit only; do not push or publish a release unless requested.
- If the user says "publish to GitHub", clarify whether they mean pushing commits or publishing a release if the intent is unclear.
- If the user says "release version X", verify the release plan and ask for confirmation before publishing it.