/**
 * Edit mode owner.
 *
 * A plain boolean held here (single owner), mirroring calclens-state.ts. Edit
 * mode is a session toggle: it always starts OFF on page load and is never
 * persisted. When ON, selecting a grid cell opens the column editor for that
 * cell's column. The rail button and the column-editor surface read and write
 * through these accessors so no other module owns the flag.
 */
let editMode = false;

const getEditMode = (): boolean => editMode;

function setEditMode(v: boolean): void {
  editMode = !!v;
}

export { getEditMode, setEditMode };
