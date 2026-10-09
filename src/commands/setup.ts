import { join } from "node:path";
import type { PiSdk } from "../agents/runner.js";
import { API_KEY, mergeCredentials, OAUTH, type PiCredential, readPiCredentials } from "../artifacts/pi-credentials.js";
import { ProgressError } from "../artifacts/progress.js";
import { AUTH_FILE, loadUserModels, MODEL_SEPARATOR, prepareUserModels } from "../artifacts/user-config.js";
import type { CliIo } from "../cli-io.js";
import type { Terminal } from "../orchestrator/services.js";
import { LIST_SEPARATOR } from "../ui/plain.js";
import { askModels, askProviders, logInTo } from "./setup-interactive.js";
import { parseSetupOptions, type SetupOptions } from "./setup-options.js";

/** A person at a terminal who can also type a secret without it being shown; or nobody. */
type SetupInput = { isTTY: false } | (Terminal & { secret?(prompt: string): Promise<string> });

/** What `oid setup` takes from outside, so that nothing below `src/cli.ts` reads the process: the user's configuration directory, oid's agent directory, the agent directory of a Pi installation (read only when asked), the person at the terminal, the standard input (when it is not a terminal) and the Pi SDK (the real one without it). */
export type SetupServices = { configDir: string; agentDir: string; piAgentDir: string; input: SetupInput; readStdin?: () => Promise<string>; sdk?: Pick<PiSdk, "ModelRuntime"> };

/** What a run without a terminal and without options is told. */
const NEEDS_OPTIONS = "oid setup needs a terminal or options: --provider P --api-key-stdin, --import-pi, --model ROLE=provider/id (see oid setup --help)";

/** A credential store that holds nothing and keeps nothing: the catalogue is read through it without creating oid's `auth.json`. */
const NO_CREDENTIALS = { read: async () => undefined, list: async () => [], modify: async () => undefined, delete: async () => undefined };

/** Pi's catalogue as oid's agents see it (the models of oid's agent directory included), read without touching any credential. */
function openCatalogue(sdk: NonNullable<SetupServices["sdk"]>, agentDir: string) {
  return sdk.ModelRuntime.create({ credentials: NO_CREDENTIALS, ...modelsFile(agentDir), refreshOnCreate: false });
}

/** Pi's runtime of oid's agent directory, with the credentials of its `auth.json`. */
function openCredentials(sdk: NonNullable<SetupServices["sdk"]>, agentDir: string) {
  return sdk.ModelRuntime.create({ authPath: join(agentDir, AUTH_FILE), ...modelsFile(agentDir), refreshOnCreate: false });
}

/** Where oid's agent directory keeps the models its user defined. */
function modelsFile(agentDir: string): { modelsPath: string } {
  return { modelsPath: join(agentDir, "models.json") };
}

/** Whether the options ask for nothing: setting up then means asking the person. */
function asksNothing(options: SetupOptions): boolean {
  return !options.login && !options.apiKeyStdin && !options.importPi && Object.keys(options.models).length === 0;
}

/** Asks the person at the terminal which providers to log in to and which models the roles run on, and writes the answers. */
async function setUpAtTerminal(io: CliIo, services: SetupServices & { input: Terminal }): Promise<number> {
  const sdk = services.sdk!;
  const catalogue = await openCatalogue(sdk, services.agentDir);
  await askProviders(io, services.input, await openCredentials(sdk, services.agentDir));
  const models = await askModels(io, services.input, catalogue, loadUserModels(services.configDir) ?? {});
  prepareUserModels(services.configDir, models)();
  io.stdout("oid is set up.\n");
  return 0;
}

/** What `oid init` tells a user who has not set up oid and is not asked, or declines. */
const HOW_TO_SET_UP = "oid has no providers and models for you yet: run oid setup (see oid setup --help).\n";

/** What `oid init` does for the user's setup: nothing without services, or when the models are set; otherwise it offers `oid setup` to a person at a terminal, and only says how to run it to anyone else. */
export async function offerSetup(io: CliIo, services: SetupServices | undefined): Promise<void> {
  if (services === undefined || loadUserModels(services.configDir) !== undefined) return;
  const accepted = services.input.isTTY && (await services.input.choose("Set up providers and models now?", ["yes", "no"])) === "yes";
  if (accepted) await runSetup(io, [], services);
  else io.stdout(HOW_TO_SET_UP);
}

export async function runSetup(io: CliIo, args: string[], services: SetupServices): Promise<number> {
  const options = parseSetupOptions(args);
  requireTerminalWhenNeeded(options, services.input);
  const sdk = services.sdk ?? (await import("@earendil-works/pi-coding-agent"));
  if (services.input.isTTY && asksNothing(options)) return setUpAtTerminal(io, { ...services, sdk, input: services.input });
  const catalogue = await openCatalogue(sdk, services.agentDir);
  requireInCatalogue(catalogue, options);
  const saveModels = Object.keys(options.models).length > 0 ? prepareUserModels(services.configDir, options.models) : undefined;
  const key = options.apiKeyStdin ? await readApiKey(services) : undefined;
  const imported = options.importPi ? readPiCredentials(services.piAgentDir) : undefined;
  if (imported !== undefined) importCredentials(io, services.agentDir, imported);
  if (key !== undefined) await storeApiKey(io, await openCredentials(sdk, services.agentDir), options.provider!, key);
  if (options.login) await logInTo(io, services.input as Terminal, await openCredentials(sdk, services.agentDir), catalogue.getProvider(options.provider!)!);
  saveModels?.();
  return 0;
}

/** The API key piped to standard input, without the line break that ends it; a terminal is not asked for it, since what is typed would be shown. */
async function readApiKey(services: SetupServices): Promise<string> {
  if (services.readStdin === undefined) throw new ProgressError("standard input is a terminal: pipe the key to oid setup --api-key-stdin");
  const key = (await services.readStdin()).trim();
  if (key === "") throw new ProgressError("no API key on standard input");
  return key;
}

/** Copies the credentials of a Pi installation into oid's agent directory and says which providers they are for. */
function importCredentials(io: CliIo, agentDir: string, credentials: Record<string, PiCredential>): void {
  mergeCredentials(agentDir, credentials);
  io.stdout(`Imported the credentials for ${Object.keys(credentials).join(LIST_SEPARATOR)} from Pi.\n`);
  if (Object.values(credentials).some((credential) => credential.type === OAUTH)) {
    io.stdout("A login that Pi and oid share has one refresh token: when one of them refreshes it, the other may have to log in again.\n");
  }
}

/** Refuses what only a person at a terminal can do: setting up with no option, and a login (which needs a browser). */
function requireTerminalWhenNeeded(options: SetupOptions, input: SetupInput): void {
  if (input.isTTY) return;
  if (asksNothing(options)) throw new ProgressError(NEEDS_OPTIONS);
  if (options.login) throw new ProgressError("a login needs a terminal; without one, pass the key with --api-key-stdin");
}

/** Refuses, before anything is written, a provider or a model that Pi's catalogue does not hold. */
function requireInCatalogue(catalogue: Awaited<ReturnType<typeof openCatalogue>>, options: SetupOptions): void {
  for (const [role, name] of Object.entries(options.models)) {
    const [provider = "", ...id] = name.split(MODEL_SEPARATOR);
    if (catalogue.getModel(provider, id.join(MODEL_SEPARATOR)) === undefined) {
      throw new ProgressError(`the model "${name}" for the role ${role} is not in Pi's catalogue`);
    }
  }
  if (options.provider !== undefined && catalogue.getProvider(options.provider) === undefined) {
    throw new ProgressError(`the provider "${options.provider}" is not one of the providers Pi knows`);
  }
}

/** Stores the API key for the provider through Pi's own login, which asks for it once. */
async function storeApiKey(io: CliIo, runtime: Awaited<ReturnType<typeof openCredentials>>, provider: string, key: string): Promise<void> {
  await runtime.login(provider, API_KEY, { prompt: async () => key, notify: () => undefined });
  io.stdout(`Stored an API key for ${provider}.\n`);
}
