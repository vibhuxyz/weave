import type { ComponentType } from "react";
import {
  ChevronLeftIcon,
  PaletteIcon,
  SlidersHorizontalIcon,
  NetworkIcon,
  BotIcon,
  BellIcon,
  KeyboardIcon,
  HeadphonesIcon,
  ArchiveIcon,
  ShieldIcon,
  CpuIcon,
  FlaskConicalIcon,
} from "lucide-react";
import { cn } from "@/shared/lib";
import { SETTINGS_TABS } from "./constants";
import type { SettingsTabId } from "./types";

const TAB_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  palette: PaletteIcon,
  sliders: SlidersHorizontalIcon,
  network: NetworkIcon,
  infinity: BotIcon,
  bell: BellIcon,
  keyboard: KeyboardIcon,
  headphones: HeadphonesIcon,
  archive: ArchiveIcon,
  shield: ShieldIcon,
  cpu: CpuIcon,
  flask: FlaskConicalIcon,
};

interface SettingsSidebarProps {
  activeTab: SettingsTabId;
  onSelectTab: (tabId: SettingsTabId) => void;
  onBack: () => void;
}

export function SettingsSidebar({
  activeTab,
  onSelectTab,
  onBack,
}: SettingsSidebarProps) {
  return (
    <aside className="flex w-[240px] shrink-0 flex-col gap-1 border-r border-white/10 p-3 select-none">
      <button
        type="button"
        onClick={onBack}
        className="flex h-9 items-center gap-2 rounded-lg px-2 text-left text-sm font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
      >
        <ChevronLeftIcon className="size-4 shrink-0" />
        <span>Back</span>
      </button>

      <div className="my-1.5 h-px bg-white/5" />

      <nav className="flex flex-col gap-0.5">
        {SETTINGS_TABS.map((tab) => {
          const Icon = TAB_ICONS[tab.iconName] || BotIcon;
          const isActive = tab.id === activeTab;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={cn(
                "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-left text-sm transition-colors",
                isActive
                  ? "bg-white/10 font-medium text-white shadow-sm"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
              )}
            >
              <Icon className="size-4 shrink-0 text-zinc-400" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
