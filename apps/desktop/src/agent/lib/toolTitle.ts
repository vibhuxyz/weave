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
