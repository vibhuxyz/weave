import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SettingsRow } from "@/shared/ui";
import { AUTO_ARCHIVE_CHOICES, NEVER_VALUE, OFFLINE_HINT } from "../constants";
import type { ArchiveLoadState } from "../types";
import { SelectSkeleton } from "./ArchiveSkeleton";

interface AutoArchiveSettingProps {
  readonly afterDays: number | null;
  readonly loadState: ArchiveLoadState;
  readonly onChange: (afterDays: number | null) => void;
}

const DESCRIPTION =
  "Automatically archive chats after this much time without a message. The chat you have open is never archived automatically.";

export function AutoArchiveSetting({ afterDays, loadState, onChange }: AutoArchiveSettingProps) {
  const value = afterDays === null ? NEVER_VALUE : String(afterDays);
  const handleChange = (next: string) => {
    const choice = AUTO_ARCHIVE_CHOICES.find((option) => option.value === next);
    if (choice) onChange(choice.days);
  };
  return (
    <SettingsRow
      label="Archive inactive chats"
      description={loadState === "offline" ? `${DESCRIPTION} ${OFFLINE_HINT}` : DESCRIPTION}
      action={({ labelId }) =>
        loadState === "loading" ? (
          <SelectSkeleton />
        ) : (
          <Select value={value} onValueChange={handleChange} disabled={loadState === "offline"}>
            <SelectTrigger className="w-44 rounded-lg" aria-labelledby={labelId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {AUTO_ARCHIVE_CHOICES.map((choice) => (
                <SelectItem key={choice.value} value={choice.value} className="rounded-lg">
                  {choice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      }
    />
  );
}
