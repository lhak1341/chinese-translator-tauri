/** True when `target` is a form control or content-editable element — a hotkey that
 * shadows a printable character (e.g. `[`/`]` for chapter navigation) must not fire while
 * the user is typing into one. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}
