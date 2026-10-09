import { join } from "node:path";
import { z } from "zod";
import { readJson } from "./project-json.js";

const USER_CONFIG_FILE = "config.json";

const userConfigSchema = z.object({ models: z.object({ fast: z.string(), default: z.string(), strong: z.string(), spec: z.string().optional() }).optional() });

/** The models the user assigned to the roles of the agents, as `provider/id`. */
export type Models = NonNullable<z.infer<typeof userConfigSchema>["models"]>;

/** The models of the user's configuration directory: the `models` of its `config.json`; none without the directory or the file. */
export function loadUserModels(configDir: string | undefined): Models | undefined {
  const document = configDir === undefined ? undefined : readJson(configDir, USER_CONFIG_FILE);  return document === undefined ? undefined : userConfigSchema.parse(document).models;
}

/** The environment variables that say where the user's oid configuration is. */
export type ConfigEnv = { HOME?: string; XDG_CONFIG_HOME?: string; OID_CONFIG_DIR?: string };

/** Where the user's oid configuration lives: `OID_CONFIG_DIR`, else `oid` under `XDG_CONFIG_HOME`, else `.config/oid` under the home. */
export function oidConfigDir(env: ConfigEnv): string {
  if (env.OID_CONFIG_DIR !== undefined) return env.OID_CONFIG_DIR;
  if (env.XDG_CONFIG_HOME !== undefined) return join(env.XDG_CONFIG_HOME, "oid");
  return join(env.HOME ?? "", ".config", "oid");
}
