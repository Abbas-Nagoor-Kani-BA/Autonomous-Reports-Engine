# Export and Copy for MSR

The data view produces two outputs:

- **Export** — fills and downloads the **WSR (Weekly Status Report)** workbook.
- **Copy for MSR** — copies formatted rows to paste into your **MSR (Monthly
  Status Report)** sheet.

They are different on purpose: the WSR is generated fresh each week, so it is
safe to fill and download; the MSR accumulates history and contains formulas, so
it is never overwritten — you paste into it instead.

![The export flow](images/placeholder.png)

## The export configuration dialog

**Export** opens a small **Export configuration** dialog before it writes
anything. From here you choose the template, the report header values, the CI
split, and the column map, then press **Export** to fill and download.

At the top, **Op co** and **Domain** sit **side by side** in one row (Op co is
the narrow field). Each is an **editable combobox** — a text input with a
themed suggestion menu, **not** a native `<select>` or `<datalist>` (the browser
datalist popup can't be styled to match the dark UI, so the extension builds its
own menu). Typing filters the suggestions; ArrowUp/ArrowDown move the highlight
and Enter picks it; clicking a suggestion fills the field.

The suggestions come from your **MSR option lists** for Op co and Domain (see
[Configuration](Configuration)), but you are **not limited to them** — you can
type any custom value in place, and that free-typed value flows straight into
the export. Your choice is remembered between exports; when a field is left
empty the report falls back to its built-in defaults (`BA` for Op co, `AO` for
Domain). The same Op co / Domain values also feed **Copy for MSR**.

## WSR export (the workbook)

The exporter loads your cached **WSR template**, patches **only** the target
sheet's cells with the current view's rows, and downloads the result as an
`.xlsx` file. The template's formatting and formulas are preserved — the
workbook is not regenerated from scratch. Column values come from the view, with
dropdown columns restricted to your configured **MSR option lists** (see
[Configuration](Configuration)); the chosen Op co / Domain populate the report's
opCo and domain columns.

## Copy for MSR (preserve history and formulas)

The **MSR (Monthly Status Report)** is a running sheet: it holds **historical
data** across months and contains **formulas**. Filling or overwriting it would
destroy that history and break the formulas.

So instead of exporting the MSR, the tool gives you **Copy for MSR**: it copies
the current view's rows — **formatted** and in the MSR column order — to the
clipboard, ready to **paste** into your existing MSR sheet. Because you paste
rows in rather than replacing the file, the MSR's history and formulas stay
intact.

## Sheet safety (WSR export)

Sheet lookup normalizes names (underscore/space/case-insensitive, exact then
loose) and **never silently falls back to another sheet** — filling the wrong
sheet once emptied a user's report, so a wrong match fails loudly instead.

## Keep the tab open

The WSR file download relies on your open ServiceNow tab (the extension page
owns the download path under MV3). Keep the tab open during export.

For the technical details of template patching and the download path, see
[Export Internals](Export-Internals).

---

Related: [Data Viewer](Data-Viewer) · [Configuration](Configuration) ·
[Filters and Presets](Filters-and-Presets) · [Export Internals](Export-Internals)
