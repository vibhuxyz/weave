import { EDITABLE_SELECTOR } from "./constants";

export function isEditableSelectionTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element && Boolean(target.closest(EDITABLE_SELECTOR))
  );
}
