import { readdirSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
import { locate, matchesGlob, userHome } from "./containment.js";

/** The files no agent may read, whatever its step: environment files, keys and credential stores. */
const SECRET_GLOBS = ["**/.env", "**/.env.*", "**/*.pem", "**/*.key", "**/secrets/**", "**/auth.json"];

/** The directories of the user's home that are always secret. */
const HOME_SECRETS = [".ssh", ".aws", ".gnupg"];
const ROOT = "/";
const HERE = ".";
const PROBE = "/_";

function inHomeSecrets(real: string): boolean {
  const home = locate(userHome(), HERE).real;
  return HOME_SECRETS.some((name) => {
    const secret = join(home, name);
    return real === secret || real.startsWith(`${secret}${ROOT}`);
  });
}

/** Whether `requested` (relative to `worktree`) is, or resolves through symbolic links to, a secret: a file matching the secret patterns, a directory that holds some, or anything in the user's SSH, AWS and GnuPG directories. */
export function isSecret(worktree: string, requested: string): boolean {
  const place = locate(worktree, requested);
  const path = place.inside ? place.relative : place.real.slice(ROOT.length);
  return inHomeSecrets(place.real) || SECRET_GLOBS.some((glob) => matchesGlob(path, glob) || matchesGlob(`${path}${PROBE}`, glob));
}

/** More entries than this under a directory and its contents are not walked: the directory counts as holding a secret. */
const WALK_CAP = 5000;
const WILDCARD = /[*?[]/;

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** The paths under `real`, relative to it; symbolic links are listed but not entered. `undefined` when there are more than the cap. */
function entriesUnder(real: string, links: boolean): string[] | undefined {
  const found: string[] = [];
  const pending = [""];
  for (let folder = pending.shift(); folder !== undefined; folder = pending.shift()) {
    for (const entry of readdirSync(join(real, folder), { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isSymbolicLink() && !links) continue;
      if (entry.isDirectory()) pending.push(path);
      found.push(path);
      if (found.length > WALK_CAP) return undefined;
    }
  }
  return found;
}

function directoryOf(glob: string): string {
  const segments = glob.split(ROOT);
  const wild = segments.findIndex((segment) => WILDCARD.test(segment));
  return segments.slice(0, wild < 0 ? segments.length : wild).join(ROOT) || HERE;
}

/** What a command that reads files would reach through `requested`: a directory with its contents, or the files a wildcard expands to. */
export type Reach = { glob: boolean; links: boolean };

/** Whether `requested` is a directory holding a secret, or a wildcard that expands to one. A tree that is too large to walk counts as holding one. Symbolic links inside are secrets when they lead to one, unless the command does not follow them (`reach.links`). */
export function reachesSecret(worktree: string, requested: string, reach: Reach): boolean {
  const directory = reach.glob ? directoryOf(requested) : requested;
  const place = locate(worktree, directory);
  if (!isDirectory(place.real)) return false;
  const found = entriesUnder(place.real, reach.links);
  if (found === undefined) return true;
  return found.some((entry) => (!reach.glob || matchesGlob(normalize(join(directory, entry)), normalize(requested))) && isSecret(worktree, join(place.real, entry)));
}
