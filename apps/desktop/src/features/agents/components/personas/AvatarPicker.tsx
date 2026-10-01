import { useEffect, type ReactNode } from "react";
import { ArrowLeftIcon, XIcon } from "lucide-react";
import { AVATAR_COLLECTIONS, collectionById, type AvatarCollectionId } from "@/features/agents/lib";
import { AgentAvatar } from "../AgentAvatar";

const GALLERY_SLOTS = [
  { top: "6%", left: "3%", size: "w-28" },
  { top: "64%", left: "16%", size: "w-32" },
  { top: "5%", left: "68%", size: "w-36" },
  { top: "60%", left: "72%", size: "w-28" },
  { top: "34%", left: "4%", size: "w-36" },
  { top: "36%", left: "76%", size: "w-32" },
] as const;

interface PickerFrameProps {
  readonly label: string;
  readonly dismissLabel: string;
  readonly icon: "close" | "back";
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}

function PickerFrame({ label, dismissLabel, icon, onDismiss, children }: PickerFrameProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div role="region" aria-label={label} className="avatar-collection-dot-grid relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden text-foreground">
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        className="absolute top-5 right-5 z-10 flex size-9 items-center justify-center rounded-full bg-white text-black shadow-lg"
      >
        {icon === "close" ? <XIcon className="size-4" /> : <ArrowLeftIcon className="size-4" />}
      </button>
      {children}
    </div>
  );
}

interface AvatarCollectionsPageProps {
  readonly onClose: () => void;
  readonly onOpen: (collectionId: AvatarCollectionId) => void;
}

export function AvatarCollectionsPage({ onClose, onOpen }: AvatarCollectionsPageProps) {
  return (
    <PickerFrame label="Avatar collections" dismissLabel="Close" icon="close" onDismiss={onClose}>
      <div className="flex min-h-0 flex-1 items-center justify-center gap-5 overflow-auto px-10 py-16">
        {AVATAR_COLLECTIONS.map((collection) => (
          <button
            key={collection.id}
            type="button"
            onClick={() => onOpen(collection.id)}
            aria-label={`Open the ${collection.label} collection`}
            className="flex h-[440px] w-[230px] shrink-0 flex-col rounded-[28px] bg-card px-5 pt-5 pb-6 text-left transition-colors hover:bg-white/[0.06]"
          >
            <span className="w-fit rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] text-white/75">Collection</span>
            <span className="flex min-h-0 flex-1 items-center justify-center">
              <AgentAvatar name={collection.label} character={collection.coverKey} size="xl" className="size-40" />
            </span>
            <span className="text-lg text-white/85">{collection.label}</span>
          </button>
        ))}
      </div>
    </PickerFrame>
  );
}

interface AvatarGalleryPageProps {
  readonly collectionId: AvatarCollectionId;
  readonly takenKeys: ReadonlySet<string>;
  readonly onBack: () => void;
  readonly onPick: (character: string) => void;
}

export function AvatarGalleryPage({ collectionId, takenKeys, onBack, onPick }: AvatarGalleryPageProps) {
  const collection = collectionById(collectionId);
  return (
    <PickerFrame label={collection ? `${collection.label} collection` : "Avatar collection"} dismissLabel="Back to collections" icon="back" onDismiss={onBack}>
      <div className="relative min-h-0 w-full flex-1">
        <p className="pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center font-light text-[clamp(3rem,8vw,7.25rem)] text-white/90 tracking-[-0.04em] whitespace-nowrap">
          {collection ? `${collection.label} collection` : "Collection"}
        </p>
        {collection?.keys.map((key, index) => {
          const slot = GALLERY_SLOTS[index];
          if (!slot) return null;
          const taken = takenKeys.has(key);
          const label = `${collection.label} avatar ${index + 1}`;
          return (
            <button
              key={key}
              type="button"
              disabled={taken}
              onClick={() => onPick(key)}
              aria-label={taken ? `${label} is already used` : `Select ${label}`}
              className={taken ? "absolute cursor-not-allowed opacity-35" : "absolute transition-transform hover:scale-105 focus-visible:scale-105"}
              style={{ top: slot.top, left: slot.left }}
            >
              <AgentAvatar name={collection.label} character={key} size="xl" className={`${slot.size} h-auto`} />
              {taken && (
                <span className="absolute top-1 left-1 rounded-full bg-white px-2 py-0.5 text-[11px] text-black">In use</span>
              )}
            </button>
          );
        })}
      </div>
    </PickerFrame>
  );
}
