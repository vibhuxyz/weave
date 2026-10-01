import { AgentAvatar } from "../AgentAvatar";

interface PersonaAvatarButtonProps {
  readonly name: string;
  readonly character: string;
  readonly onSelect: () => void;
}

export function PersonaAvatarButton({ name, character, onSelect }: PersonaAvatarButtonProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label="Select avatar"
      className="group relative flex h-40 w-full items-center justify-center"
    >
      <AgentAvatar name={name || "Persona"} seed={name || "persona"} character={character} size="xl" className="size-32" />
      <span className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-[118%] -translate-y-1/2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        Select avatar
      </span>
    </button>
  );
}
