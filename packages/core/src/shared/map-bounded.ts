export async function mapBounded<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  const cursor = { next: 0 };
  const worker = async (): Promise<void> => {
    while (cursor.next < items.length) {
      const index = cursor.next;
      cursor.next += 1;
      const item = items[index] as T;
      results[index] = await work(item);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}
