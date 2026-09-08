# Export Internals

The WSR (Weekly Status Report) export fills a **template workbook** by patching
only the target sheet's XML, never by regenerating the file. The technical rules
here protect against two past incidents: a wrong-sheet fill that emptied a
report, and Excel's repair dialog on deleted formula rows.

## Why patch, not regenerate

The service worker **never** touches XLSX bytes. The viewer page loads the
cached template, patches the target sheet's XML with fflate zip surgery
(`core/templatexml.ts`), and downloads via `Blob` +
`chrome.downloads.download`.

- Extension **pages** have `URL.createObjectURL`; **workers** do not — so the
  download must happen from the page.
- Never move export building back into the background.
- Never regenerate the workbook with a spreadsheet library (ExcelJS/SheetJS
  re-serialization corrupts formatted templates).

```mermaid
flowchart LR
    T[(Cached WSR template)] --> UZ[Unzip in the viewer page - fflate]
    UZ --> SL[Resolve target sheet - strict lookup]
    SL --> PX[Patch only that sheet's XML cells]
    PX --> CC[Fix calcChain / calcPr if formula rows changed]
    CC --> Z[Re-zip] --> DL[Blob + chrome.downloads.download]
```

## Sheet lookup safety

Sheet lookup normalizes names (`_`/space/case-insensitive, exact then loose) and
**never silently falls back to another sheet**. A wrong-sheet fill once emptied
a user's report, so an unresolved sheet fails loudly instead of writing to the
wrong place.

## calcChain / recalculation

If formula rows get deleted during patching, strip `xl/calcChain.xml` and set
`fullCalcOnLoad="1"` on `<calcPr>`, or Excel raises its repair dialog on open.

## Copy for MSR

The MSR (Monthly Status Report) sheet accumulates **historical data** across
months and contains **formulas**, so it is never filled or overwritten. Instead,
the **Copy for MSR** path serializes the current view's rows — **formatted** and
in MSR column order — to the clipboard (`surfaces/viewer/clipboard.ts`, button
label `"Copy for MSR"` in `surfaces/viewer/toolbar.ts`). The user pastes those
rows into the existing MSR sheet, so its history and formulas stay intact. No
file is written for this path.

## Tests

`tools/template-export-test.js` covers template XML patching and sheet lookup;
`tools/export-service-test.js` covers the viewer-bound export building
(including the `fmt`→SLA coupling). See [Testing](Testing).

---
Related: [Export](Export) · [Architecture](Architecture) ·
[Timezone Contract](Timezone-Contract)
