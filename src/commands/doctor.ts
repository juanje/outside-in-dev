import { existsSync } from "node:fs";
import { join } from "node:path";
import type { PiSdk } from "../agents/runner.js";
import { readOnlyCredentials } from "../artifacts/pi-credentials.js";
import { ProgressError } from "../artifacts/progress.js";
import { CONFIG_FILE, loadProjectConfig } from "../artifacts/project-config.js";
import { missingTools, toolsOf } from "../artifacts/project-tools.js";
import { AUTH_FILE, loadAssignedModels, MODELS_FILE } from "../artifacts/user-config.js";
import type { CliIo } from "../cli-io.js";
import { type Check, connectChecks, credentialChecks, formatCheck, modelChecks, providersWithCredential, STATUS } from "./setup-checks.js";

/** What `oid doctor` and the start of `oid run` and `oid resume` take from outside: the user's configuration directory, oid's agent directory, and the Pi SDK (the real one without it). */
export type DoctorServices = { configDir: string; agentDir: string; sdk?: Pick<PiSdk, "ModelRuntime"> };

/** What the checks can be asked for. */
export type DoctorOptions = { connect: boolean };

/** The checks of the project: its configuration (ok, or why it cannot be read and the command that creates it) and the tool of each command it configures. */
function projectChecks(cwd: string): Check[] {
  try {
    const { commands } = loadProjectConfig(cwd);
    const tools = toolsOf(commands);
    const absent = missingTools(cwd, tools);
    const toolCheck = (tool: string): Check => (absent.includes(tool) ? { status: STATUS.missing, subject: `tool ${tool}`, note: `not found; install it, or change the command that uses it in ${CONFIG_FILE}` } : { status: STATUS.ok, subject: `tool ${tool}`, note: "" });
    return [{ status: STATUS.ok, subject: "project", note: CONFIG_FILE }, ...tools.map(toolCheck)];
  } catch (error) {
    if (!(error instanceof ProgressError)) throw error;
    return [{ status: STATUS.missing, subject: "project", note: `${error.message}; run oid init` }];
  }
}

type Sdk = NonNullable<DoctorServices["sdk"]>;

/** Pi's runtime of oid's agent directory. Without `authPath` it reads the credentials through a store that never writes; with it, as a call needs them. */
function openRuntime(sdk: Sdk, agentDir: string, writable: boolean) {
  const modelsPath = join(agentDir, MODELS_FILE);
  return sdk.ModelRuntime.create({ ...(writable ? { authPath: join(agentDir, AUTH_FILE) } : { credentials: readOnlyCredentials(agentDir) }), modelsPath, refreshOnCreate: false });
}

/** One minimal call to each provider that has a credential, on a runtime that can use the credentials as a call does. The keys the calls use are removed from what is reported. */
async function connection(sdk: Sdk, services: DoctorServices, models: Record<string, string>, providers: string[]): Promise<Check[]> {
  const runtime = await openRuntime(sdk, services.agentDir, existsSync(join(services.agentDir, AUTH_FILE)));
  const resolved = await Promise.all(providers.map((provider) => runtime.getAuth(provider)));
  const secrets = resolved.flatMap((result) => result?.auth.apiKey ?? []);
  return connectChecks(models, providers, runtime, secrets);
}

/** `oid doctor`: prints a line for each check and returns 0 when all are ok, else 1. */
export async function runDoctor(io: CliIo, args: string[], services: DoctorServices): Promise<number> {
  const checks = await checkSetup(io.cwd, services, { connect: args.includes("--connect") });
  io.stdout(checks.map((check) => `${formatCheck(check)}\n`).join(""));
  return checks.every(({ status }) => status === STATUS.ok) ? 0 : 1;
}

/** Every check of the setup in the order they are listed: the project, the models of the roles in Pi's catalogue and a credential for the provider of each; with `connect`, a minimal call to each provider that has one. Pi's runtime is opened on a store that never writes, so nothing is created or changed. */
export async function checkSetup(cwd: string, services: DoctorServices, options: DoctorOptions): Promise<Check[]> {
  const sdk = services.sdk ?? (await import("@earendil-works/pi-coding-agent"));
  const runtime = await openRuntime(sdk, services.agentDir, false);
  const models = loadAssignedModels(services.configDir);
  const credentials = await credentialChecks(models, runtime);
  const calls = options.connect ? await connection(sdk, services, models, providersWithCredential(credentials)) : [];
  return [...projectChecks(cwd), ...modelChecks(models, runtime), ...credentials, ...calls];
}
