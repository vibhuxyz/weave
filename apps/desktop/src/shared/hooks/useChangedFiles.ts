import { useQuery } from "@tanstack/react-query";
import { getChangedFiles } from "@/shared/api";
import { changedFilesQueryKey, isHomeRelativePath } from "@/shared/lib";
import { useHomeDir } from "./useHomeDir";

export function useChangedFiles(
  path: string | null | undefined,
  enabled = true,
) {
  const homeDir = useHomeDir();
  const needsHomeDir = Boolean(path && isHomeRelativePath(path));
  const queryKey = changedFilesQueryKey(path, homeDir);
  const normalizedPath = queryKey[1];
  return useQuery({
    queryKey,
    queryFn: () => getChangedFiles(normalizedPath ?? ""),
    enabled:
      enabled && Boolean(normalizedPath) && (!needsHomeDir || homeDir !== null),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,

    refetchOnWindowFocus: "always",
  });
}
