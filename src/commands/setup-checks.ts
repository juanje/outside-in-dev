import { names } from "../agents/names.js";
import { MODEL_ROLES, MODEL_SEPARATOR, REQUIRED_ROLES } from "../artifacts/user-config.js";

/** One thing `oid doctor` looked at: whether it is in place, what it is, and what is worth knowing about it (for a problem, the command that fixes it). */
export type Check = { status: Status; subject: string; note: string };

/** How a check came out: in place, not in place (the note names the fix), or tried and failed. */
const [OK, MISSING, FAILED] = names("ok missing failed") as [string, string, string];
export const STATUS = { ok: OK, missing: MISSING, failed: FAILED };
type Status = string;

/** How the answer of a provider says that the call failed. */
const ERROR_STOP = "error";

/** A check as one line: `status: subject: note`. */
export function formatCheck({ status, subject, note }: Check): string {
  return note === "" ? `${status}: ${subject}` : `${status}: ${subject}: ${note}`;
}

/** The part of Pi's catalogue that the checks read. */
export type Catalogue = { getModel(provider: string, id: string): unknown };

/** The provider and the model id of a name written `provider/id`. */
function splitModel(name: string): { provider: string; id: string } {
  const [provider = "", ...id] = name.split(MODEL_SEPARATOR);
  return { provider, id: id.join(MODEL_SEPARATOR) };
}

/** The part of Pi's runtime that says whether a provider has a credential. */
export type Authentication = { checkAuth(provider: string): Promise<{ source?: string } | undefined> };

/** The distinct providers of the models the roles are assigned, in the order of the roles. */
function providersOf(models: Record<string, string | undefined>): string[] {
  const names = MODEL_ROLES.flatMap((role) => models[role] ?? []);
  return [...new Set(names.map((name) => splitModel(name).provider))];
}

/** What the subject of a credential check starts with, before the provider. */
const CREDENTIAL_SUBJECT ="credential for ";

/** The providers that the credential checks found a credential for. */
export function providersWithCredential(checks: Check[]): string[] {
  return checks.filter(({ status, subject }) => status === STATUS.ok && subject.startsWith(CREDENTIAL_SUBJECT)).map(({ subject }) => subject.slice(CREDENTIAL_SUBJECT.length));
}

/** One check for each provider the roles use: ok, with where Pi finds the credential (never the credential), or the commands that give the provider one. */
export async function credentialChecks(models: Record<string, string | undefined>, auth: Authentication): Promise<Check[]> {
  return Promise.all(
    providersOf(models).map(async (provider): Promise<Check> => {
      const subject = `${CREDENTIAL_SUBJECT}${provider}`;
      const found = await auth.checkAuth(provider);
      if (found !== undefined) return { status: STATUS.ok, subject, note: found.source ?? "" };
      return { status: STATUS.missing, subject, note: `run oid setup --provider ${provider} --api-key-stdin (or --login at a terminal), or set the provider's environment variable` };
    }),
  );
}

/** The part of Pi's runtime that makes the minimal call. */
export type Caller = Catalogue & { completeSimple(model: never, context: { messages: { role: "user"; content: string; timestamp: number }[] }, options: { maxTokens: number; signal: AbortSignal }): Promise<{ stopReason: string; errorMessage?: string }> };

/** What replaces a secret in a message. */
const HIDDEN = "[hidden]";
/** The most the minimal call asks for, and how long it may take. */
const CALL_TOKENS = 16;
const CALL_TIMEOUT_MS = 30_000;

/** One check for each provider: one minimal call to the first model a role gives it. A provider whose answer stops with an error is failed, with its message, from which every secret is removed. */
export async function connectChecks(models: Record<string, string | undefined>, providers: string[], runtime: Caller, secrets: string[]): Promise<Check[]> {
  const names = MODEL_ROLES.flatMap((role) => models[role] ?? []);
  return Promise.all(
    providers.map(async (provider): Promise<Check> => {
      const { id } = splitModel(names.find((name) => splitModel(name).provider === provider)!);
      const model = runtime.getModel(provider, id) as never;
      const context = { messages: [{ role: "user" as const, content: "Reply with ok.", timestamp: Date.now() }] };
      const answer = await runtime.completeSimple(model, context, { maxTokens: CALL_TOKENS, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
      const subject = `connect ${provider}`;
      if (answer.stopReason !== ERROR_STOP) return { status: STATUS.ok, subject, note: "answered" };
      const message = secrets.reduce((text, secret) => text.replaceAll(secret, HIDDEN), answer.errorMessage ?? "no message");
      return { status: STATUS.failed, subject, note: message };
    }),
  );
}

/** One check for each role that has a model, or needs one: ok when the catalogue holds the model, else what is wrong and the command that assigns another. */
export function modelChecks(models: Record<string, string | undefined>, catalogue: Catalogue): Check[] {
  return MODEL_ROLES.flatMap((role): Check[] => {
    const name = models[role];
    const subject = `model ${role}`;
    if (name === undefined) return REQUIRED_ROLES.includes(role) ? [{ status: STATUS.missing, subject, note: "not assigned; run oid setup" }] : [];
    const { provider, id } = splitModel(name);
    if (catalogue.getModel(provider, id) === undefined) return [{ status: STATUS.missing, subject, note: `"${name}" is not in Pi's catalogue; run oid setup --model ${role}=provider/id` }];
    return [{ status: STATUS.ok, subject, note: name }];
  });
}
