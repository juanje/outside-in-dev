import { readlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

/** Where a requested path really is: the resolved location, its path relative to the worktree and whether it is inside. */
export type Located = { real: string; relative: string; inside: boolean };

const MAX_SYMLINKS = 40;
const ROOT = "/";
const PARENT = "..";
const CURRENT = ".";

function linkTarget(path: string): string | undefined {
  try {
    return readlinkSync(path);
  } catch {
    return undefined;
  }
}

function segmentsOf(path: string): string[] {
  return path.split(ROOT).filter((segment) => segment !== "");
}

/** Resolves an absolute path the way the operating system does: one segment at a time, so `..` follows a symlink and a path that does not exist yet keeps its resolved nearest existing ancestor. */
function resolveReal(path: string): string {
  const pending = segmentsOf(path);
  let current = ROOT;
  let links = 0;
  for (let segment = pending.shift(); segment !== undefined; segment = pending.shift()) {
    if (segment === PARENT) current = dirname(current);
    else if (segment !== CURRENT) {
      const next = join(current, segment);
      const target = linkTarget(next);
      if (target === undefined) current = next;
      else {
        links += 1;
        if (links > MAX_SYMLINKS) throw new Error(`too many symbolic links in ${path}`);
        if (isAbsolute(target)) current = ROOT;
        pending.unshift(...segmentsOf(target));
      }
    }
  }
  return current;
}

/** The user's home: `HOME` when it is set, which is what a shell expands `~` to, else the operating system's answer. */
export function userHome(): string {
  const home = process.env.HOME;
  return home === undefined || home === "" ? homedir() : home;
}

function expand(requested: string): string {
  const unprefixed = requested.startsWith("@") ? requested.slice(1) : requested;
  return unprefixed === "~" || unprefixed.startsWith(`~${ROOT}`) ? join(userHome(), unprefixed.slice(1)) : unprefixed;
}

/** The single path authority of the sandbox: resolves `requested` (relative to `worktree`) with symlinks followed on both sides and tells whether it ends up inside the worktree. */
export function locate(worktree: string, requested: string): Located {
  const root = resolveReal(resolve(worktree));
  const wanted = expand(requested);
  try {
    const real = resolveReal(isAbsolute(wanted) ? wanted : `${root}${ROOT}${wanted}`);
    const path = relative(root, real);
    return { real, relative: path, inside: path !== PARENT && !path.startsWith(`${PARENT}${ROOT}`) && !isAbsolute(path) };
  } catch {
    return { real: wanted, relative: wanted, inside: false };
  }
}

const REGEX_SPECIAL = /[.+^${}()|[\]\\]/g;

function globSource(glob: string): string {
  return glob
    .replace(REGEX_SPECIAL, "\\$&")
    .replace(/\*\*\//g, "\u0000")
    .replace(/\*\*/g, "\u0001")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\u0000/g, "(?:.*/)?")
    .replace(/\u0001/g, ".*");
}

/** Whether `path`, relative to the worktree, matches `glob`: `**` crosses directories, `*` and `?` stay inside one. */
export function matchesGlob(path: string, glob: string): boolean {
  return new RegExp(`^${globSource(glob)}$`).test(path);
}

const WILDCARD = /[*?[]/;

/** Whether `path` (relative to the worktree) is one of the `denied` globs, or the worktree root or a directory that holds a denied file. */
export function isDenied(path: string, denied: string[]): boolean {
  return path === "" || denied.some((glob) => matchesGlob(path, glob) || (!WILDCARD.test(glob) && glob.startsWith(`${path}${ROOT}`)));
}
