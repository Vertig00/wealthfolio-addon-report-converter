# XTB Update Import Mode Analysis (sanitized)

## Report variant

File suffix `-UPDATE` represents a recent-period report. It uses the same three sheets as `-ALL`:
- `Closed Positions`
- `Cash Operations`
- `Open Positions`

## Observed date range

- Cash Operations `Date from`: Excel serial 46295.916666666664
- Cash Operations `Date to`: Excel serial 46316.54832454861

This overlaps the tail of the full-history (`-ALL`) report.

## Cash Operations in update sample

Operation counts:
- `Stock purchase`: 4
- `IKE deposit`: 1
- `Free funds interest`: 1
- `Total`: 1 (skip)

## Overlap with full-history report

Comparing Cash Operations by `ID`:
- `IKE deposit` ID `1482621703` exists in both reports.
- `Free funds interest` ID `1464392726` exists in both reports.
- The 4 `Stock purchase` IDs are new in the update report.

Conclusion: update reports are not strictly disjoint. They can contain operations already present in a previous full or update import.

## Deduplication strategy

- Use Cash Operations `ID` as the stable operation identifier.
- Before importing an update, compare each operation ID with already imported IDs.
- Skip operations whose ID has already been imported.
- Do not rely solely on date ranges, because an update range can overlap previous imports.
- Persist imported IDs or a checkpoint in a future implementation; this is not implemented yet.

## Initial vs update mode

- Initial mode: import all supported Cash Operations from a full-history report.
- Update mode: import only Cash Operations whose IDs are not already known.
- Both modes use the same sheet layout, column mapping, and Wealthfolio CSV format.
