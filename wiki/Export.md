# Export

The data view fills a **template MSR workbook** and can also copy rows for
pasting into an existing sheet.

![The export flow](images/placeholder.png)

## MSR workbook export

The exporter loads your cached MSR template, patches **only** the target sheet's
cells with the current view's rows, and downloads the result as an `.xlsx` file.
The template's formatting and formulas are preserved — the workbook is not
regenerated from scratch. Column values come from the view, with MSR dropdown
columns restricted to your configured **MSR option lists** (see
[Configuration](Configuration)).

## Copy-for-MSR

**Copy-for-MSR** copies the rows in the current view to the clipboard in the
MSR column order, ready to paste into an existing MSR sheet without downloading
a file.

## Sheet safety

Sheet lookup normalizes names (underscore/space/case-insensitive, exact then
loose) and **never silently falls back to another sheet** — filling the wrong
sheet once emptied a user's report, so a wrong match fails loudly instead.

## Keep the tab open

The file download relies on your open ServiceNow tab (the extension page owns
the download path under MV3). Keep the tab open during export.

For the technical details of template patching and the download path, see
[Export Internals](Export-Internals).

---
Related: [Data Viewer](Data-Viewer) · [Configuration](Configuration) ·
[Export Internals](Export-Internals)
