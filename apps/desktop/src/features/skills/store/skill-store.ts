import { create } from "zustand";
import type { SkillListing, SkillListingMessage } from "../types";

interface SkillStore {
  readonly listing: SkillListing;
  readonly startLoading: () => void;
  readonly receive: (message: SkillListingMessage) => void;
  readonly reset: () => void;
}

export const useSkillStore = create<SkillStore>((set) => ({
  listing: { status: "idle" },
  startLoading: () => set((state) => (state.listing.status === "ready" ? state : { listing: { status: "loading" } })),
  receive: (message) => set({
    listing: message.type === "skills"
      ? { status: "ready", skills: message.skills, unknownSkills: message.unknownSkills }
      : { status: "error", message: message.message },
  }),
  reset: () => set({ listing: { status: "idle" } }),
}));
