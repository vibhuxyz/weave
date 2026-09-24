const ARCHIVED_DATE_FORMAT = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

export function formatArchivedDate(archivedAt: number | string | null | undefined): string | null {
  if (archivedAt === null || archivedAt === undefined) return null;
  const date = new Date(archivedAt);
  return Number.isNaN(date.getTime()) ? null : `Archived ${ARCHIVED_DATE_FORMAT.format(date)}`;
}
