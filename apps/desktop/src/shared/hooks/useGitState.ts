import { useQuery } from "@tanstack/react-query";
import { getGitState } from "@/shared/api";
import { gitStateQueryKey, isHomeRelativePath } from "@/shared/lib";
import { useHomeDir } from "./useHomeDir";

export function useGitState(path: string | null | undefined, enabled = true) {
  const homeDir = useHomeDir();
  
  const needsHomeDir = Boolean(path && isHomeRelativePath(path));
  const queryKey = gitStateQueryKey(path, homeDir);
  const normalizedPath = queryKey[1];
  return useQuery({
    queryKey,
    queryFn: () => getGitState(normalizedPath ?? ""),
    enabled:
      enabled && Boolean(normalizedPath) && (!needsHomeDir || homeDir !== null),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
   
    refetchOnWindowFocus: "always",
  });
}
