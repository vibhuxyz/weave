import type { ToolKind } from "@agentclientprotocol/sdk";
import {
  FileTextIcon,
  GlobeIcon,
  LightbulbIcon,
  PencilIcon,
  SearchIcon,
  SettingsIcon,
  TerminalIcon,
  Trash2Icon,
  WrenchIcon,
} from "lucide-react";

/** ACP reports what a tool *does*, so the icon comes from `kind`, not a name map. */
export const KIND_ICONS: Record<ToolKind, typeof WrenchIcon> = {
  read: FileTextIcon,
  edit: PencilIcon,
  delete: Trash2Icon,
  move: PencilIcon,
  search: SearchIcon,
  execute: TerminalIcon,
  think: LightbulbIcon,
  fetch: GlobeIcon,
  switch_mode: SettingsIcon,
  other: WrenchIcon,
};

/** Swap a leading past-tense verb in an ACP title for its present-tense form. */
const TITLE_VERB_SWAP: Array<[RegExp, string]> = [
  [/^Read /, "Reading "],
  [/^Edit /, "Editing "],
  [/^Write /, "Creating "],
  [/^Wrote /, "Creating "],
  [/^Search(ed)? /, "Searching "],
  [/^Delete[d]? /, "Deleting "],
  [/^Ran /, "Running "],
  [/^Fetch(ed)? /, "Fetching "],
];

export function activeTitle(title: string): string {
  for (const [re, replacement] of TITLE_VERB_SWAP) {
    if (re.test(title)) return title.replace(re, replacement);
  }
  return title;
}

export function shorten(title: string, projectDir: string | null): string {
  if (!projectDir) return title;
  return title
    .replaceAll(projectDir + "/", "")
    .replaceAll(projectDir, ".")
    .trim();
}
