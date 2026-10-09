import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Credential, CredentialStore } from "@earendil-works/pi-ai";
import { z } from "zod";
import { writeFileAtomic } from "./atomic-write.js";
import { JSON_INDENT } from "./checkpoint.js";
import { ProgressError } from "./progress.js";
import { readJson } from "./project-json.js";
import { AUTH_FILE } from "./user-config.js";

/** The permissions Pi gives its own `auth.json` and the directory of it: the user's only. */
const PRIVATE_FILE = 0o600;
const PRIVATE_DIRECTORY = 0o700;

/** The two kinds of credential Pi stores: an API key, and the login of a provider (OAuth). */
export const API_KEY = "api_key";
export const OAUTH = "oauth";

const credentialSchema = z.discriminatedUnion("type", [z.object({ type: z.literal(API_KEY) }).passthrough(), z.object({ type: z.literal(OAUTH) }).passthrough()]);

/** One credential as Pi stores it in an `auth.json`: an API key or a login. */
export type PiCredential = z.infer<typeof credentialSchema>;

const credentialsSchema = z.record(z.string(), credentialSchema);

/** Adds the credentials to the `auth.json` of oid's agent directory, creating it private to the user: a credential replaces the one of the same provider, and the others are kept. */
export function mergeCredentials(agentDir: string, credentials: Record<string, PiCredential>): void {
  const stored = credentialsSchema.parse(readJson(agentDir, AUTH_FILE) ?? {});
  mkdirSync(agentDir, { recursive: true, mode: PRIVATE_DIRECTORY });
  writeFileAtomic(join(agentDir, AUTH_FILE), `${JSON.stringify({ ...stored, ...credentials }, null, JSON_INDENT)}\n`, PRIVATE_FILE);
}

/** A credential store of Pi that serves the `auth.json` of an agent directory as it is and never writes (a change is ignored, and answers with what is stored): Pi can then check for credentials without creating or touching the file. */
export function readOnlyCredentials(agentDir: string): CredentialStore {
  const stored = () => credentialsSchema.parse(readJson(agentDir, AUTH_FILE) ?? {}) as Record<string, Credential>;
  return {
    read: async (providerId) => stored()[providerId],
    list: async () => Object.entries(stored()).map(([providerId, { type }]) => ({ providerId, type })),
    modify: async (providerId) => stored()[providerId],
    delete: async () => undefined,
  };
}

/** The credentials, by provider, that the `auth.json` of a Pi agent directory holds. */
export function readPiCredentials(piAgentDir: string): Record<string, PiCredential> {
  const credentials = credentialsSchema.parse(readJson(piAgentDir, AUTH_FILE) ?? {});
  if (Object.keys(credentials).length === 0) throw new ProgressError(`no credentials in ${piAgentDir}`);
  return credentials;
}
