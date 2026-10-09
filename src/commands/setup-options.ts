import { ProgressError } from "../artifacts/progress.js";
import { MODEL_ROLES, MODEL_SEPARATOR } from "../artifacts/user-config.js";
import { LIST_SEPARATOR } from "../ui/plain.js";

/** What the options of `oid setup` ask for. */
export type SetupOptions = { provider?: string; login: boolean; apiKeyStdin: boolean; importPi: boolean; models: Record<string, string> };

/** The option that names the provider, and the option that assigns a model to a role. */
const PROVIDER_OPTION = "--provider";
const MODEL_OPTION = "--model";

/** The value that follows an option; refused when the option is the last argument. */
function valueOf(args: string[], at: number): string {
  const value = args[at + 1];
  if (value === undefined) throw new ProgressError(`${args[at]} needs a value`);
  return value;
}

/** A `ROLE=provider/id` assignment, refused when it is not one or names a role that does not exist. */
function parseAssignment(text: string): [string, string] {
  const [role = "", ...rest] = text.split("=");
  const model = rest.join("=");
  if (!model.includes(MODEL_SEPARATOR)) throw new ProgressError(`${MODEL_OPTION} ${text}: expected ROLE=provider/id`);
  if (!MODEL_ROLES.includes(role)) throw new ProgressError(`unknown role ${role}; valid roles: ${MODEL_ROLES.join(LIST_SEPARATOR)}`);
  return [role, model];
}

/** Refuses the combinations of options that cannot work. */
function requireConsistent(options: SetupOptions): void {
  if (options.login && options.apiKeyStdin) throw new ProgressError("give --login or --api-key-stdin, not both");
  if (options.apiKeyStdin && options.provider === undefined) throw new ProgressError(`--api-key-stdin needs ${PROVIDER_OPTION}`);
  if (options.login && options.provider === undefined) throw new ProgressError(`--login needs ${PROVIDER_OPTION}`);
}

/** Reads the options of `oid setup`. */
export function parseSetupOptions(args: string[]): SetupOptions {
  const options: SetupOptions = { login: false, apiKeyStdin: false, importPi: false, models: {} };
  for (let at = 0; at < args.length; at++) {
    const arg = args[at];
    if (arg === PROVIDER_OPTION) options.provider = valueOf(args, at++);
    else if (arg === "--login") options.login = true;
    else if (arg === "--api-key-stdin") options.apiKeyStdin = true;
    else if (arg === "--import-pi") options.importPi = true;
    else if (arg === MODEL_OPTION) {
      const [role, model] = parseAssignment(valueOf(args, at++));
      options.models[role] = model;
    } else throw new ProgressError(`unknown option ${arg}`);
  }
  requireConsistent(options);
  return options;
}
