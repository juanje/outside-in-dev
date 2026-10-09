const SEPARATOR = "/";
const RELATIVE_PREFIX = ".";

/** Whether a module specifier names a file by a path from the importing file, rather than a package. */
export function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith(RELATIVE_PREFIX);
}

/** The fixed directory of a glob: the segments before the first one that holds a wildcard. */
function globRoot(glob: string): string {
  const segments = glob.split(SEPARATOR);
  const wild = segments.findIndex((segment) => /[*?[\]{}()!]/.test(segment));
  return segments.slice(0, wild).join(SEPARATOR);
}

/** Whether a path, relative to the project, lies under the fixed directory of one of the source globs; the file need not exist. */
export function isInsideSource(globs: string[], path: string): boolean {
  return globs.some((glob) => {
    const root = globRoot(glob);
    return root === "" || path.startsWith(`${root}${SEPARATOR}`);
  });
}

/** Whether a path, relative to the project, lies under the source, the unit tests or the step definitions: the code whose type errors a Green reports. */
export function isInsideCode(paths: { source: string[]; unit_tests: string[]; bdd_steps: string[] }, path: string): boolean {
  return isInsideSource([...paths.source, ...paths.unit_tests, ...paths.bdd_steps], path);
}
