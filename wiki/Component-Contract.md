# Component Contract

UI units extend `components/component.ts`. Two rules are load-bearing and were
both found the hard way — do not regress them.

## build() runs once; patch() runs on every state change

`build()` constructs the DOM **once**; `patch()` applies **every** subsequent
state change. A full rebuild per change destroys input focus and caret
position.

- The condition builder compares row **shapes**, not values, so typing never
  re-renders its rows.
- If you find yourself rebuilding DOM inside `patch()`, you are reintroducing
  the focus/caret bug this rule prevents.

## No instance fields or #private methods during build()

Subclasses **must not** use instance fields or `#private` methods from `build()`
or the first `patch()`:

- Both are installed on the instance only **after** `super()` returns, but the
  base constructor calls `build()`.
- A field read during build is `undefined`.
- A `#private` method call during build throws
  `TypeError: Receiver must be an instance of class ...`.

Helpers called during build must therefore be **`protected` prototype methods**,
not `#private` methods or arrow-function fields.

## Sibling elements arrive through deps

Elements that are **siblings** rather than children (the log modal, `#count`,
`#slaBar`, the add-condition button) arrive through `deps`, **not** `q()`. `q()`
resolves within the component's own subtree; siblings are owned elsewhere and
injected.

## Every component needs its own test

The end-to-end viewer DOM test (`tools/viewer-dom-test.ts`) drives the grid
through the viewer modules and **cannot** validate a component's own contract —
it stayed green through an unseeded picker list, three `DataGrid` width/state
bugs, and Escape silently not closing two of four overlays. Add a component-level
test for every component. See [Testing](Testing).

---
Related: [Architecture](Architecture) · [Testing](Testing) ·
[Contributing](Contributing)
