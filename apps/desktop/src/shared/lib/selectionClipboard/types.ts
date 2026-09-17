
export interface SelectionClipboardPayload {
  html: string;
  text: string;
}

export interface SelectionLink {
  href: string;
  label: string;
}

export interface SelectionTextSegment {
  href: string | null;
  text: string;
}
