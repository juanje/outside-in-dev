import type { OidWorld } from "./world.js";

export type Choice = { prompt: string; actions: string[] };
type Terminal = { choices: Choice[] };

const terminals = new WeakMap<OidWorld, Terminal>();

/** What the scripted terminal of the scenario was asked. */
export function terminalOf(world: OidWorld): Terminal {
  const found = terminals.get(world) ?? { choices: [] };
  terminals.set(world, found);
  return found;
}
