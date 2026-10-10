import { describe, expect, it } from "vitest";
import { GitError } from "../../src/artifacts/git-workspace.js";
import type { OIEventBody } from "../../src/events/types.js";
import { endOnGitFailure } from "../../src/orchestrator/run-git-failure.js";

/** A bus that keeps the events it is given. */
function recordingBus() {
  const events: OIEventBody[] = [];
  return { events, bus: { emit: (event: OIEventBody) => void events.push(event) as undefined } };
}

describe("a run that meets a failed git command", () => {
  it("ends with an error event holding git's message and the exit code 1", async () => {
    const { bus, events } = recordingBus();
    const code = await endOnGitFailure(bus, () => Promise.reject(new GitError("git commit failed: no identity")));
    expect({ code, events }).toEqual({ code: 1, events: [{ type: "error", message: "git commit failed: no identity" }] });
  });

  it("goes on as it was when nothing fails, and lets any other exception through", async () => {
    const { bus, events } = recordingBus();
    expect(await endOnGitFailure(bus, () => Promise.resolve(3))).toBe(3);
    await expect(endOnGitFailure(bus, () => Promise.reject(new TypeError("a bug")))).rejects.toThrow("a bug");
    expect(events).toEqual([]);
  });
});
