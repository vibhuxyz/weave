export interface RunConfig {
  id?: string;
  engine?: string;
  fallbackEngines?: string[];
  model?: string;
  mode?: string;
  effort?: string;
  fast?: "on" | "off";
  maxTurns?: number;
  timeoutMs?: number;
  weaveDir?: string;
}
