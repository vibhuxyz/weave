export interface RunConfig {
  id?: string;
  engine?: string;
  fallbackEngines?: string[];
  model?: string;
  mode?: string;
  effort?: string;
  fast?: "on" | "off";
  configOptions?: Record<string, string>;
  maxTurns?: number;
  timeoutMs?: number;
  weaveDir?: string;
}
