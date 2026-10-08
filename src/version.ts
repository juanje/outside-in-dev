import { readFileSync } from "node:fs";

/** The version of the installed package, read from the `package.json` beside `src/` or `dist/`. */
export function packageVersion(): string {
  const packageJson = new URL("../package.json", import.meta.url);
  return (JSON.parse(readFileSync(packageJson).toString()) as { version: string }).version;
}
