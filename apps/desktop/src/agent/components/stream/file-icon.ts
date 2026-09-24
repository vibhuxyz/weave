import { CodeXmlIcon, StickyNoteIcon, type LucideIcon } from "lucide-react";

const DOCUMENT_EXTENSION = /\.(md|mdx|markdown|txt|rst)$/i;

export function fileIconFor(path: string): LucideIcon {
  return DOCUMENT_EXTENSION.test(path) ? StickyNoteIcon : CodeXmlIcon;
}
