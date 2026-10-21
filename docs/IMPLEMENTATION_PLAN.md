# Implementation Plan

## Stage 0 — inspect the project
- [ ] Inspect the generated scaffold and installed SDK version.
- [ ] Confirm available test/build/lint/type-check scripts.
- [ ] Identify how the addon is run and packaged.
- [ ] Avoid unnecessary configuration changes.

**Done when:** the base project builds and its development workflow is documented.

## Stage 1 — inspect an XTB report
- [ ] Analyze a local CSV/XLSX sample.
- [ ] Document structure, headers, sections, and variants.
- [ ] Create synthetic/anonymized fixtures.
- [ ] Document ambiguities and questions for the user.

**Done when:** the format is documented and test samples contain no sensitive data.

## Stage 2 — file reading and GUI preview
- [ ] Support CSV/XLSX selection and upload.
- [ ] Support multiple worksheets.
- [ ] Show preview and file-read errors.
- [ ] Implement English and Polish UI strings.
- [ ] Test empty, malformed, and unsupported files.

**Done when:** users can upload a file and inspect its structure without converting it.

## Stage 3 — XTB parser and canonical model
- [ ] Define a source-adapter interface.
- [ ] Implement only confirmed XTB variants.
- [ ] Preserve source row references.
- [ ] Treat unknown operation types as warnings/errors.
- [ ] Test every supported operation type.

**Done when:** parsing is deterministic and produces the canonical model.

## Stage 4 — validation and export
- [ ] Verify the target format against current Wealthfolio documentation/SDK.
- [ ] Implement export.
- [ ] Show output preview and diagnostics in the GUI.
- [ ] Add file download.
- [ ] Test output fields and compatibility.

**Done when:** the generated file passes validation and can be downloaded.

## Stage 5 — direct import
- [ ] Verify the official import API and permissions.
- [ ] Add account selection.
- [ ] Add validation and duplicate handling.
- [ ] Require explicit confirmation before writing.
- [ ] Show successful, skipped, and failed record counts.

**Done when:** import has been tested with safe sample data and errors are clear.

## Stage 6 — additional providers
- [ ] Add mBank as a separate adapter.
- [ ] Reuse the canonical model, validation, and exporter.
- [ ] Do not copy XTB-specific parsing logic into the mBank adapter.

## Quality checks for each stage

Run only scripts that exist in the project, such as type-check, lint, tests, build, or bundle. Record exact results. Do not mark a stage complete if a relevant check fails.
