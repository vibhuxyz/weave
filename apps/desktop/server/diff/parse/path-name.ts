export interface PathParts {
  readonly path: string;
  readonly dir: string;
  readonly name: string;
}

export function splitPath(path: string): PathParts {
  const cut = path.lastIndexOf("/");
  return cut === -1
    ? { path, dir: "", name: path }
    : { path, dir: path.slice(0, cut), name: path.slice(cut + 1) };
}
