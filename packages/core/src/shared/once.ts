export function once<T>(load: () => Promise<T>): () => Promise<T> {
  const cache: { pending: Promise<T> | null } = { pending: null };
  return () => {
    cache.pending ??= load();
    return cache.pending;
  };
}
