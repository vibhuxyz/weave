function getAllowedWritePaths(cwd: string, home: string): string[] {
  const allowed = [
    cwd,
    "/tmp",
    "/private/tmp",
    "/var/folders",
    "/private/var/folders",
    "/dev",
  ];
  if (home) {
    allowed.push(
      `${home}/.cache`,
      `${home}/.local`,
      `${home}/.claude`,
      `${home}/.codex`,
      `${home}/.gemini`,
      `${home}/.config`,
    );
  }
  return allowed;
}

function getSensitivePaths(home: string): string[] {
  if (!home) return [];
  return [
    `${home}/.ssh`,
    `${home}/.aws`,
    `${home}/.gnupg`,
    `${home}/.kube`,
  ];
}

export function buildMacOsSandboxProfile(cwd: string): string {
  const home = process.env.HOME ?? "";
  const allowedWritePaths = getAllowedWritePaths(cwd, home);
  const sensitivePaths = getSensitivePaths(home);

  const allowedWritesSbpl = allowedWritePaths
    .map((p) => `(allow file-write* (subpath "${p}"))`)
    .join("\n");

  const sensitiveDeniesSbpl = sensitivePaths
    .map((p) => `(deny file-read* file-write* (subpath "${p}"))`)
    .join("\n");

  return `(version 1)
(allow default)
(deny file-write*)
${allowedWritesSbpl}
${sensitiveDeniesSbpl}
`;
}
