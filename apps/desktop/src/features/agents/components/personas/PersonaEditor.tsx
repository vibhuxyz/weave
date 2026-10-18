import { useState, type ReactNode } from "react";
import type { Agent } from "@/features/agents/hooks";
import { avatarKeyForEdit, type AvatarCollectionId } from "@/features/agents/lib";
import type { PersonaDraft } from "@/features/agents/personas";
import { AvatarCollectionsPage, AvatarGalleryPage } from "./AvatarPicker";
import { PersonaDialog } from "./PersonaDialog";

interface PersonaEditorProps {
  readonly initial: Agent | null;
  readonly takenKeys: ReadonlySet<string>;
  readonly onClose: () => void;
  readonly onSave: (draft: PersonaDraft, existingId: string | null) => { ok: true; id: string } | { ok: false; message: string };
  readonly children: ReactNode;
}

type PickerStage = { readonly kind: "form" } | { readonly kind: "collections" } | { readonly kind: "gallery"; readonly collectionId: AvatarCollectionId };

function formCopy(initial: Agent | null): { readonly title: string; readonly submitLabel: string; readonly nameLocked: boolean } {
  if (!initial) return { title: "New persona", submitLabel: "Create persona", nameLocked: false };
  const nameLocked = initial.builtin === true || initial.overridesBuiltin === true;
  if (initial.builtin === true && initial.overridesBuiltin !== true) {
    return { title: "Customize persona", submitLabel: "Save", nameLocked };
  }
  return { title: "Edit persona", submitLabel: "Save", nameLocked };
}

export function PersonaEditor({ initial, takenKeys, onClose, onSave, children }: PersonaEditorProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [skills, setSkills] = useState<readonly string[]>(initial?.skills ?? []);
  const [character, setCharacter] = useState(() => avatarKeyForEdit(initial?.character, takenKeys, initial?.id));
  const copy = formCopy(initial);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<PickerStage>({ kind: "form" });

  const submit = () => {
    const result = onSave({ name, description, instructions, skills, character }, initial?.id ?? null);
    if (result.ok) onClose();
    else setError(result.message);
  };

  if (stage.kind === "collections") {
    return (
      <AvatarCollectionsPage
        onClose={() => setStage({ kind: "form" })}
        onOpen={(collectionId) => setStage({ kind: "gallery", collectionId })}
      />
    );
  }

  if (stage.kind === "gallery") {
    return (
      <AvatarGalleryPage
        collectionId={stage.collectionId}
        takenKeys={takenKeys}
        onBack={() => setStage({ kind: "collections" })}
        onPick={(next) => {
          if (takenKeys.has(next)) return;
          setCharacter(next);
          setStage({ kind: "form" });
        }}
      />
    );
  }

  return (
    <>
      {children}
      <PersonaDialog
        title={copy.title}
        submitLabel={copy.submitLabel}
        nameLocked={copy.nameLocked}
        name={name}
        description={description}
        instructions={instructions}
        skills={skills}
        character={character}
        error={error}
        onName={setName}
        onDescription={setDescription}
        onInstructions={setInstructions}
        onSkills={setSkills}
        onSelectAvatar={() => setStage({ kind: "collections" })}
        onClose={onClose}
        onSubmit={submit}
      />
    </>
  );
}
