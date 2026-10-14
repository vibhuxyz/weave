const WORKER_COUNT = "(?:\\d+|a|an|one|two|three|four|five|six|several|multiple|a few)";
const START_WORKERS = new RegExp(`\\b(?:start|spin up|launch|run|use|add|create)\\s+${WORKER_COUNT}\\s+workers?\\b`, "i");
const RUN_IN_PARALLEL = /\b(?:run|do|execute)\s+(?:this\s+|it\s+|the work\s+)?in\s+parallel\b|\bparallelize\b|\bsplit\s+(?:this|the work|it)\b/i;

export function asksForParallel(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.startsWith("/")) return false;
  return START_WORKERS.test(trimmed) || RUN_IN_PARALLEL.test(trimmed);
}
