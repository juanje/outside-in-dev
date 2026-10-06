import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BUILD_HINT = "run `npm run build` first";

/** Why `dist/cli.js` cannot be trusted for a @process scenario, or null when it can. */
export function buildProblem(root: string): string | null {
  const binary = join(root, "dist", "cli.js");
  if (!existsSync(binary)) return `dist/cli.js is missing: ${BUILD_HINT}`;
  const builtAt = statSync(binary).mtimeMs;
  for (const entry of readdirSync(join(root, "src"), { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && statSync(join(entry.parentPath, entry.name)).mtimeMs > builtAt) {
      return `dist/cli.js is older than src/${entry.name}: ${BUILD_HINT}`;
    }
  }
  return null;
}
