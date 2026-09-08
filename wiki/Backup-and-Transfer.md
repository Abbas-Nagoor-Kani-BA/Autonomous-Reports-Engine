# Backup and Transfer

The **Backup / transfer** card in [Configuration](Configuration) exports and
imports all settings as a single JSON file.

## What is included

The exported JSON contains:

- instance URL,
- queues and team members,
- pull parameters,
- saved filters and presets,
- column mapping,
- CI split groups,
- hidden view columns,
- MSR option lists, and
- the cached Excel template.

## Export / import

- **Export settings (.json)** — download a backup file.
- **Import settings** — choose a JSON file; its values **replace** all of the
  above.

Imports accept both the current format and backups from the previous project
name, so older backups still restore cleanly.

## Notes

- Pulled ticket data is **not** part of the settings backup — only configuration
  and the cached template.
- To move a full working setup to another machine, export here, install the
  extension there ([Installation](Installation)), and import.

---
Related: [Configuration](Configuration) · [Installation](Installation)
