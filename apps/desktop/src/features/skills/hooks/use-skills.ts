import { useSkillStore } from "../store";
import type { SkillListing } from "../types";

export function useSkillListing(): SkillListing {
  return useSkillStore((state) => state.listing);
}
