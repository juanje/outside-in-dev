import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { writeFileAtomic } from "./atomic-write.js";
import { JSON_INDENT } from "./checkpoint.js";
import { ProgressError } from "./progress.js";
import { LIST_SEPARATOR } from "../ui/plain.js";
import { readJson } from "./project-json.js";

const USER_CONFIG_FILE = "config.json";

/** What separates the provider from the model in a name such as `provider/id`. */
export const MODEL_SEPARATOR = "/";

/** The file of an agent directory that holds the models its user defined. */
export const MODELS_FILE = "models.json";

/** The file of an agent directory that holds the credentials, by provider. */
export const AUTH_FILE = "auth.json";

const modelsSchema = z.object({ fast: z.string(), default: z.string(), strong: z.string(), spec: z.string().optional() });
const userConfigSchema = z.object({ models: modelsSchema.optional() });

/** The roles of the agents that the user assigns a model to, in the order `oid setup` asks for them. */
export const MODEL_ROLES = Object.keys(modelsSchema.shape);

/** The models the user assigned to the roles of the agents, as `provider/id`. */
export type Models = NonNullable<z.infer<typeof userConfigSchema>["models"]>;

/** The models of the user's configuration directory: the `models` of its `config.json`; none without the directory or the file. */
export function loadUserModels(configDir: string | undefined): Models | undefined {
  const document = configDir === undefined ? undefined : readJson(configDir, USER_CONFIG_FILE);  return document === undefined ? undefined : userConfigSchema.parse(document).models;
}

const storedConfigSchema = z.object({ models: z.record(z.string(), z.string()).optional() }).passthrough();

/** The models the user's configuration assigns, whichever roles it leaves out: none without the directory or the file. */
export function loadAssignedModels(configDir: string): Record<string, string> {
  const document = readJson(configDir, USER_CONFIG_FILE);
  return document === undefined ? {} : (storedConfigSchema.parse(document).models ?? {});
}

/** The roles every run needs a model for. */
export const REQUIRED_ROLES = Object.entries(modelsSchema.shape).filter(([, schema]) => !schema.isOptional()).map(([role]) => role);

/** Assigns the models to their roles in the `config.json` of the user's configuration directory, the other roles and whatever else the file holds being kept. Refuses, before anything is written, a result that leaves a required role without a model; returns the function that writes it, creating the directory. */
export function prepareUserModels(configDir: string, models: Record<string, string>): () => void {
  const stored = storedConfigSchema.parse(readJson(configDir, USER_CONFIG_FILE) ?? {});
  const assigned = { ...stored.models, ...models };
  const missing = REQUIRED_ROLES.filter((role) => assigned[role] === undefined);
  if (missing.length > 0) throw new ProgressError(`roles without a model: ${missing.join(LIST_SEPARATOR)}; give --model ROLE=provider/id for each`);
  return () => {
    mkdirSync(configDir, { recursive: true });
    writeFileAtomic(join(configDir, USER_CONFIG_FILE), `${JSON.stringify({ ...stored, models: assigned }, null, JSON_INDENT)}\n`);
  };
}

/** The environment variables that say where the user's oid configuration is. */
export type ConfigEnv = { HOME?: string; XDG_CONFIG_HOME?: string; OID_CONFIG_DIR?: string };

/** Where the user's oid configuration lives: `OID_CONFIG_DIR`, else `oid` under `XDG_CONFIG_HOME`, else `.config/oid` under the home. */
export function oidConfigDir(env: ConfigEnv): string {
  if (env.OID_CONFIG_DIR !== undefined) return env.OID_CONFIG_DIR;
  if (env.XDG_CONFIG_HOME !== undefined) return join(env.XDG_CONFIG_HOME, "oid");
  return join(env.HOME ?? "", ".config", "oid");
}

/** Where oid keeps the Pi agent directory of its sessions, so that Pi never reads the user's own `~/.pi/agent`: `agent` under the configuration directory. `OID_AGENT_DIR` overrides the default. */
export function oidAgentDir(env: ConfigEnv & { OID_AGENT_DIR?: string }): string {
  return env.OID_AGENT_DIR ?? join(oidConfigDir(env), "agent");
}
