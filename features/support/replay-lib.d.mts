export type ReplayKind = "unit" | "bdd" | "typecheck";

/** What a call asks for: the whole suite, one unit test, some scenarios, or nothing (the type check). */
export type ReplayRequest = "suite" | { file?: string; name?: string } | { locations: string[] } | undefined;

/** One call of a replay: `here` holds `replay/`, `cwd` is where the call runs, `output` is the report file (relative to `cwd`) of the kinds that write one. */
export function replayCall(kind: ReplayKind, call: { here: string; cwd: string; request: ReplayRequest; output?: string }): { exitCode: number; stdout: string; stderr: string };

export function finish(result: { exitCode: number; stdout: string; stderr: string }): never;
export function unescapedName(pattern: string): string;
