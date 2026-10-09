import type { CliIo } from "../cli-io.js";
import type { Terminal } from "../orchestrator/services.js";
import { API_KEY, OAUTH } from "../artifacts/pi-credentials.js";
import { ProgressError } from "../artifacts/progress.js";
import { MODEL_ROLES, MODEL_SEPARATOR, REQUIRED_ROLES } from "../artifacts/user-config.js";
import { LIST_SEPARATOR } from "../ui/plain.js";

/** What a provider's login asks of the person: a secret, text, a code pasted from a browser, or a choice among options. */
type LoginPrompt = { type: "secret" | "text" | "manual_code" | "select"; message: string; options?: readonly { id: string; label: string }[] };

/** The person at a terminal as a provider's login sees them; a terminal that cannot hide what is typed has no `secret`. */
type LoginTerminal = Pick<Terminal, "line"> & { secret?(prompt: string): Promise<string> };

/** Answers the questions of a provider's login at the terminal: a secret at a prompt that does not show it, a choice by its number. */
export function terminalInteraction(io: CliIo, terminal: LoginTerminal) {
  return {
    prompt: async (prompt: LoginPrompt): Promise<string> => {
      if (prompt.type === "secret") {
        if (terminal.secret === undefined) throw new Error("this terminal cannot hide what is typed: pipe the key with --api-key-stdin");
        return terminal.secret(`${prompt.message}: `);
      }
      if (prompt.type !== "select") return terminal.line(`${prompt.message}: `);
      const options = prompt.options ?? [];
      io.stdout(`${options.map((option, at) => `  ${at + 1}. ${option.label}\n`).join("")}`);
      return options[Number(await terminal.line(`${prompt.message} (number): `)) - 1]!.id;
    },
    notify: (event: LoginEvent): void => io.stdout(describeEvent(event)),
  };
}

/** What a provider's login tells the person while it runs: an address to open, a code to enter elsewhere, a message or its progress. */
type LoginEvent =
  | { type: "auth_url"; url: string; instructions?: string }
  | { type: "device_code"; userCode: string; verificationUri: string }
  | { type: "info"; message: string; links?: readonly { url: string; label?: string }[] }
  | { type: "progress"; message: string };

/** The lines that show a login event. */
function describeEvent(event: LoginEvent): string {
  switch (event.type) {
    case "auth_url":
      return `Open this address in a browser to log in: ${event.url}\n${event.instructions === undefined ? "" : `${event.instructions}\n`}`;
    case "device_code":
      return `Go to ${event.verificationUri} and enter the code ${event.userCode}\n`;
    case "info":
      return `${event.message}\n${(event.links ?? []).map((link) => `  ${link.label ?? "See"}: ${link.url}\n`).join("")}`;
    default:
      return `${event.message}\n`;
  }
}

/** A provider of Pi's catalogue as the questions see it: how it can be logged in to. */
type LoginProvider = { id: string; auth: { oauth?: unknown; apiKey?: { login?: unknown } } };

/** The two ways to log in to a provider, as Pi names them. */
type LoginType = typeof OAUTH | typeof API_KEY;

/** The part of Pi's runtime that logs in. */
type LoginRuntime = { getProviders(): readonly LoginProvider[]; login(provider: string, type: LoginType, interaction: ReturnType<typeof terminalInteraction>): Promise<unknown> };

/** The ways a provider can be logged in to: its own login, and an API key it asks for. */
function loginTypes(provider: LoginProvider): LoginType[] {
  const types: LoginType[] = [];
  if (provider.auth.oauth !== undefined) types.push(OAUTH);
  if (provider.auth.apiKey?.login !== undefined) types.push(API_KEY);
  return types;
}

/** Logs in to the provider with its own login, or with an API key when it has none; refused when it has neither. */
export async function logInTo(io: CliIo, terminal: LoginTerminal, runtime: LoginRuntime, provider: LoginProvider): Promise<void> {
  const [type] = loginTypes(provider);
  if (type === undefined) throw new ProgressError(`${provider.id} has no login: set its credentials in the environment, as Pi documents`);
  await runtime.login(provider.id, type, terminalInteraction(io, terminal));
}

/** Which way to log in to a provider that offers both; asked until the answer is one of the two. */
async function askLoginType(terminal: LoginTerminal): Promise<LoginType> {
  for (;;) {
    const answer = (await terminal.line("Use the provider's login or an API key? Answer login or key: ")).trim().toLowerCase();
    if (answer === "login") return OAUTH;
    if (answer === "key") return API_KEY;
  }
}

/** Asks which providers to log in to, one after the other, and logs in to each with the way it offers (or the person chooses), until the answer is empty. */
export async function askProviders(io: CliIo, terminal: LoginTerminal, runtime: LoginRuntime): Promise<void> {
  const providers = runtime.getProviders();
  io.stdout(`Providers: ${providers.map((provider) => provider.id).join(LIST_SEPARATOR)}\n`);
  for (;;) {
    const id = (await terminal.line("Provider to log in to (an id from the list; empty to finish): ")).trim();
    if (id === "") return;
    const provider = providers.find((candidate) => candidate.id === id);
    const types = provider === undefined ? [] : loginTypes(provider);
    if (types.length === 0) io.stdout(`${id} is not a provider with a login\n`);
    else await logIn(io, runtime, id, types.length === 1 ? types[0]! : await askLoginType(terminal), terminal);
  }
}

/** Logs in to a provider and says why when the login fails, so that the person can try another way or another provider. */
async function logIn(io: CliIo, runtime: LoginRuntime, id: string, type: LoginType, terminal: LoginTerminal): Promise<void> {
  try {
    await runtime.login(id, type, terminalInteraction(io, terminal));
  } catch (error) {
    io.stdout(`the login to ${id} failed: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

/** The part of Pi's catalogue that the questions use. */
type Catalogue = { getModel(provider: string, id: string): unknown; getModels(): readonly { provider: string; id: string }[] };

/** How many matching models are listed for an answer that is not a model. */
const SUGGESTIONS = 10;

/** Whether Pi's catalogue holds the model `provider/id`. */
function inCatalogue(catalogue: Catalogue, name: string): boolean {
  const [provider = "", ...id] = name.split(MODEL_SEPARATOR);
  return catalogue.getModel(provider, id.join(MODEL_SEPARATOR)) !== undefined;
}

/** What to tell the person about an answer that is not a model: the models whose name contains it, at most `SUGGESTIONS` of them. */
function matches(catalogue: Catalogue, text: string): string {
  const found = catalogue.getModels().map((model) => `${model.provider}${MODEL_SEPARATOR}${model.id}`).filter((name) => name.toLowerCase().includes(text.toLowerCase()));
  const listed = found.slice(0, SUGGESTIONS).map((name) => `  ${name}\n`).join("");
  return found.length === 0 ? `no model in Pi's catalogue matches ${text}\n` : `${listed}${found.length > SUGGESTIONS ? `  ... and ${found.length - SUGGESTIONS} more\n` : ""}`;
}

/** What is wrong with an answer that is not empty: a `provider/id` that is not in the catalogue, or text that is not a `provider/id` and is answered with the models that match it; undefined when the answer is a model. */
function problemWith(catalogue: Catalogue, answer: string): string | undefined {
  if (!answer.includes(MODEL_SEPARATOR)) return matches(catalogue, answer);
  return inCatalogue(catalogue, answer) ? undefined : `${answer} is not in Pi's catalogue\n`;
}

/** Asks which model a role runs on until the answer is a model of the catalogue, or empty when the role may keep its model or go without; undefined when it is empty. */
async function askModel(io: CliIo, terminal: Pick<Terminal, "line">, catalogue: Catalogue, role: string, current: string | undefined): Promise<string | undefined> {
  for (;;) {
    const answer = (await terminal.line(`Choose the ${role} model (provider/id${current === undefined ? "" : `; empty keeps ${current}`}): `)).trim();
    if (answer === "" && (current !== undefined || !REQUIRED_ROLES.includes(role))) return undefined;
    const problem = answer === "" ? `the ${role} role needs a model\n` : problemWith(catalogue, answer);
    if (problem === undefined) return answer;
    io.stdout(problem);
  }
}

/** Asks, for each role, which model it runs on, and returns the models that were answered: an empty answer keeps the current model of the role (or skips the role when it has none). */
export async function askModels(io: CliIo, terminal: Pick<Terminal, "line">, catalogue: Catalogue, current: Record<string, string | undefined>): Promise<Record<string, string>> {
  const models: Record<string, string> = {};
  for (const role of MODEL_ROLES) {
    const model = await askModel(io, terminal, catalogue, role, current[role]);
    if (model !== undefined) models[role] = model;
  }
  return models;
}
