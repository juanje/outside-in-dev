import { join } from "node:path";
import type { Readable, Writable } from "node:stream";
import { type ConfigEnv, oidAgentDir, oidConfigDir } from "../artifacts/user-config.js";
import type { SetupServices } from "./setup.js";
import { terminalInput } from "./terminal-input.js";

/** What says where Pi keeps its own agent directory, beside where oid keeps its configuration. */
type SetupEnv = ConfigEnv & { OID_AGENT_DIR?: string; PI_CODING_AGENT_DIR?: string };

/** A stream that knows whether it is a terminal. */
type Stream<T> = T & { isTTY?: boolean };

/** The text a stream holds until it ends. */
async function readAll(stream: Readable): Promise<string> {
  let text = "";
  for await (const chunk of stream) text += String(chunk);
  return text;
}

/** What `oid setup` and `oid init` take from the process: where the configuration is, a person at the terminal when both ends are one and, otherwise, the standard input to read a key from. */
export function setupServices(env: SetupEnv, stdin: Stream<Readable>, stdout: Stream<Writable>): SetupServices {
  const paths = { configDir: oidConfigDir(env), agentDir: oidAgentDir(env), piAgentDir: env.PI_CODING_AGENT_DIR ?? join(env.HOME ?? "", ".pi", "agent") };
  if (stdin.isTTY && stdout.isTTY) return { ...paths, input: terminalInput(stdin, stdout) };
  return { ...paths, input: { isTTY: false }, ...(stdin.isTTY ? {} : { readStdin: () => readAll(stdin) }) };
}
