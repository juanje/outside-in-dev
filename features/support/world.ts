import { After, Before, setWorldConstructor, World } from "@cucumber/cucumber";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLI_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../src/cli.ts");
const TSX_LOADER_URL = import.meta.resolve("tsx");

export type Scenario = { name: string; bdd: string };
export type Feature = {
  id: string;
  title: string;
  status: string;
  cycle_step?: string;
  scenarios?: Scenario[];
};
export type Progress = { current_focus: string | null; features: Feature[] };

/** Splits a command line into arguments, honouring double quotes and backslash-escaped quotes. */
export function splitArgs(line: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuotes = false;
  let started = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\" && line[i + 1] === '"') {
      current += '"';
      i++;
      started = true;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
      started = true;
    } else if (ch === " " && !inQuotes) {
      if (started) args.push(current);
      current = "";
      started = false;
    } else {
      current += ch;
      started = true;
    }
  }
  if (started) args.push(current);
  return args;
}

export class OidWorld extends World {
  dir = "";
  stdout = "";
  stderr = "";
  exitCode: number | null = null;
  progressBefore: string | null = null;

  path(rel: string): string {
    return join(this.dir, rel);
  }

  write(rel: string, content: string): void {
    mkdirSync(dirname(this.path(rel)), { recursive: true });
    writeFileSync(this.path(rel), content);
  }

  readProgressRaw(): string | null {
    return existsSync(this.path("progress.json")) ? readFileSync(this.path("progress.json"), "utf8") : null;
  }

  loadProgress(): Progress {
    const raw = this.readProgressRaw();
    return raw === null ? { current_focus: null, features: [] } : (JSON.parse(raw) as Progress);
  }

  saveProgress(progress: Progress): void {
    this.write("progress.json", JSON.stringify(progress, null, 2) + "\n");
  }

  run(commandLine: string): void {
    const args = splitArgs(commandLine);
    if (args[0] === "oid") args.shift();
    this.progressBefore = this.readProgressRaw();
    const result = spawnSync(process.execPath, ["--import", TSX_LOADER_URL, CLI_PATH, ...args], {
      cwd: this.dir,
      env: { ...process.env, NODE_OPTIONS: "" },
      encoding: "utf8",
    });
    this.stdout = result.stdout ?? "";
    this.stderr = result.stderr ?? "";
    this.exitCode = result.status;
  }

  /** Runs the command with piped output, reads the first chunk of stdout, then destroys the stream. */
  async runClosingOutputEarly(commandLine: string): Promise<void> {
    const args = splitArgs(commandLine);
    if (args[0] === "oid") args.shift();
    const child = spawn(process.execPath, ["--import", TSX_LOADER_URL, CLI_PATH, ...args], {
      cwd: this.dir,
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    const exited = new Promise<number | null>((done) => child.on("close", (code) => done(code)));
    await new Promise<void>((done) => child.stdout.once("data", () => done()));
    child.stdout.destroy();
    this.exitCode = await exited;
    this.stdout = "";
    this.stderr = stderr;
  }
}

setWorldConstructor(OidWorld);

Before(function (this: OidWorld) {
  this.dir = mkdtempSync(join(tmpdir(), "oid-bdd-"));
});

After(function (this: OidWorld) {
  rmSync(this.dir, { recursive: true, force: true });
});
