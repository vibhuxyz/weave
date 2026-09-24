export const MAX_TABLE_ROWS = 200;

export function cell(text: string): string {
  return text.replace(/\s+/g, " ").replaceAll("|", "\\|").trim();
}

export function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const shown = rows.slice(0, MAX_TABLE_ROWS);
  const lines = [`| ${headers.join(" | ")} |`, `|${headers.map(() => "---").join("|")}|`, ...shown.map((row) => `| ${row.map(cell).join(" | ")} |`)];
  const hidden = rows.length - shown.length;
  return [...lines, ...(hidden > 0 ? [``, `(+${hidden} more rows)`] : [])].join("\n");
}
