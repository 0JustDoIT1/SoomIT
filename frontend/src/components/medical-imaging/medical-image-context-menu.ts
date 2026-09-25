type ContextMenuEvent = {
  preventDefault: () => void;
};

/** Keep secondary-button imaging tools active without opening the browser menu. */
export function preventMedicalImageContextMenu(event: ContextMenuEvent) {
  event.preventDefault();
}
