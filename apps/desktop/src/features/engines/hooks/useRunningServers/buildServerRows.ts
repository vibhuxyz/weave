import { basename, isUnder, KNOWN_SERVICES } from "./detect";
import type { DetectedServer, DockerService, RunningServer } from "./types";

export function buildServerRows({
  detected,
  containers,
  roots,
  alive,
  stopping,
}: {
  detected: DetectedServer[];
  containers: DockerService[];
  roots: string[];
  alive: Record<number, boolean>;
  stopping: Record<string, boolean>;
}): RunningServer[] {
  const sessionPorts = new Set(detected.map((s) => s.port));

  const containerRows = containers
    .filter((c): c is DockerService & { workingDir: string } => {
      const workingDir = c.workingDir;
      return workingDir != null && roots.some((r) => isUnder(workingDir, r));
    })
    // A container with nothing published is unreachable from the host, so
    // there is nothing for the user to have been using.
    .filter((c) => c.ports.length > 0)
    .flatMap<RunningServer & { container: NonNullable<RunningServer["container"]> }>((c) => {
      const port = c.ports[0];
      if (port === undefined) return [];
      return [{
        key: `container:${c.id}`,
        port,
        label: KNOWN_SERVICES[port] || c.image.split(":")[0] || c.name,
        command: c.image,
        project: c.composeProject || basename(c.workingDir),
        alive: true,
        stopping: stopping[`container:${c.id}`] ?? false,
        container: {
          id: c.id,
          name: c.name,
          composeProject: c.composeProject,
        },
        leftover: !c.ports.some((p) => sessionPorts.has(p)),
      }];
    });

  // A port a shown container publishes is *its* row, not a transcript row
  // too — otherwise Postgres appears twice, once scraped and once real.
  const shown = new Set(containerRows.map((r) => r.container.id));
  const containerPorts = new Set(
    containers.filter((c) => shown.has(c.id)).flatMap((c) => c.ports),
  );

  const processRows = detected
    .filter((s) => !containerPorts.has(s.port))
    .map<RunningServer>((s) => ({
      ...s,
      key: `port:${s.port}`,
      alive: alive[s.port] ?? true,
      stopping: stopping[`port:${s.port}`] ?? false,
      leftover: false,
    }))
    // Drop a port once it's confirmed dead — unless we're mid-stop, so the
    // "Stopping…" row stays visible until the kill actually lands.
    .filter((s) => alive[s.port] !== false || s.stopping);

  return [...processRows, ...containerRows];
}
