export interface RunningServer {
  /** Stable identity: `port:3000` for a process, `container:<id>` for Docker. */
  key: string;
  port: number;
  /** Friendly label (the tool title, e.g. "Start Express server"). */
  label: string;
  /** The actual command line, when we could read it. */
  command: string;
  /** Basename of the working directory the command ran in. */
  project?: string;
  alive: boolean;
  /** True between the confirm and the port going quiet. */
  stopping: boolean;
  /** Set when this row is a Docker container rather than a process. */
  container?: { id: string; name: string; composeProject?: string };
  /**
   * The current chat did not start this — it is left over from an earlier
   * session (or from before the app was launched) and is still running.
   */
  leftover: boolean;
}

export interface PortInfo {
  pid: number;
  command: string;
}

/** Mirrors `DockerService` in src-tauri/src/lib.rs. */
export interface DockerService {
  id: string;
  name: string;
  image: string;
  ports: number[];
  composeProject?: string;
  workingDir?: string;
}

export type DetectedServer = Pick<
  RunningServer,
  "port" | "label" | "command" | "project"
>;
