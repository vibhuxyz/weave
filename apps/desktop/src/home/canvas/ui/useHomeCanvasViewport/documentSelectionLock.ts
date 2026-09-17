import { useCallback, useRef } from "react";

type SelectionLockSnapshot = {
  bodyUserSelect: string;
  bodyWebkitUserSelect: string;
  documentElementUserSelect: string;
  documentElementWebkitUserSelect: string;
};

type WebkitSelectionStyle = CSSStyleDeclaration & {
  webkitUserSelect?: string;
};

function restoreStyleProperty(
  style: CSSStyleDeclaration,
  property: string,
  value: string,
): void {
  if (value) {
    style.setProperty(property, value);
    return;
  }

  style.removeProperty(property);
}

function webkitUserSelect(style: CSSStyleDeclaration): string {
  return (style as WebkitSelectionStyle).webkitUserSelect ?? "";
}

function setSelectionDisabled(style: CSSStyleDeclaration): void {
  style.setProperty("user-select", "none");
  style.setProperty("-webkit-user-select", "none");
  (style as WebkitSelectionStyle).webkitUserSelect = "none";
}

function restoreWebkitUserSelect(
  style: CSSStyleDeclaration,
  value: string,
): void {
  if (value) {
    style.setProperty("-webkit-user-select", value);
  } else {
    style.removeProperty("-webkit-user-select");
  }
  (style as WebkitSelectionStyle).webkitUserSelect = value;
}

/** Disables text selection on the document during a drag/pan/resize gesture. */
export function useDocumentSelectionLock() {
  const documentSelectionLockRef = useRef<SelectionLockSnapshot | null>(null);

  const lockDocumentSelection = useCallback(() => {
    if (documentSelectionLockRef.current !== null) {
      return;
    }

    documentSelectionLockRef.current = {
      bodyUserSelect: document.body.style.getPropertyValue("user-select"),
      bodyWebkitUserSelect: webkitUserSelect(document.body.style),
      documentElementUserSelect:
        document.documentElement.style.getPropertyValue("user-select"),
      documentElementWebkitUserSelect: webkitUserSelect(
        document.documentElement.style,
      ),
    };
    setSelectionDisabled(document.documentElement.style);
    setSelectionDisabled(document.body.style);
    document.getSelection()?.removeAllRanges();
  }, []);

  const unlockDocumentSelection = useCallback(() => {
    if (documentSelectionLockRef.current === null) {
      return;
    }

    restoreStyleProperty(
      document.documentElement.style,
      "user-select",
      documentSelectionLockRef.current.documentElementUserSelect,
    );
    restoreWebkitUserSelect(
      document.documentElement.style,
      documentSelectionLockRef.current.documentElementWebkitUserSelect,
    );
    restoreStyleProperty(
      document.body.style,
      "user-select",
      documentSelectionLockRef.current.bodyUserSelect,
    );
    restoreWebkitUserSelect(
      document.body.style,
      documentSelectionLockRef.current.bodyWebkitUserSelect,
    );
    documentSelectionLockRef.current = null;
  }, []);

  return { lockDocumentSelection, unlockDocumentSelection };
}
