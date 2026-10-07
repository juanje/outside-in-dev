import { describe, expect, it } from "vitest";
import { checkResponse } from "../../src/agents/response-check.js";

const USAGE = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

/** A `message_end` event carrying an assistant message in Pi's shape. */
function assistantEnd(fields: Record<string, unknown>) {
  return { type: "message_end", message: { role: "assistant", usage: USAGE, content: [], stopReason: "stop", ...fields } };
}

describe("checkResponse", () => {
  it("classifies a resolved 401 as a provider error that is not transient, keeping the provider's message", () => {
    const errorMessage = '401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}';
    expect(checkResponse([assistantEnd({ stopReason: "error", errorMessage })])).toEqual({ kind: "error", transient: false, message: errorMessage });
  });

  it("classifies rate limits, server errors and network failures as transient provider errors", () => {
    const messages = ["429 rate limit exceeded", "529 overloaded_error: Overloaded", "503 Service Unavailable", "fetch failed", "read ECONNRESET", "connect ETIMEDOUT 1.2.3.4:443", "socket hang up"];
    for (const errorMessage of messages) {
      expect(checkResponse([assistantEnd({ stopReason: "error", errorMessage })]), errorMessage).toMatchObject({ kind: "error", transient: true });
    }
  });

  it("classifies quota, billing, authentication and unknown model errors as not transient, even behind a 429", () => {
    const messages = [
      "429 You exceeded your current quota, please check your plan and billing details",
      "429 insufficient_quota",
      "402 Insufficient credits",
      "403 Forbidden",
      "401 Incorrect API key provided",
      "404 model: claude-nope not found",
    ];
    for (const errorMessage of messages) {
      expect(checkResponse([assistantEnd({ stopReason: "error", errorMessage })]), errorMessage).toMatchObject({ kind: "error", transient: false });
    }
  });

  it("calls a turn empty when no assistant message ended or every one has no content", () => {
    expect(checkResponse([])).toEqual({ kind: "empty" });
    expect(checkResponse([{ type: "agent_end", messages: [] }])).toEqual({ kind: "empty" });
    expect(checkResponse([assistantEnd({ content: [] }), assistantEnd({ content: [] })])).toEqual({ kind: "empty" });
  });

  it("calls a turn productive when an assistant message has text or a tool call", () => {
    const text = assistantEnd({ content: [{ type: "text", text: "Working on it." }] });
    const toolCall = assistantEnd({ stopReason: "toolUse", content: [{ type: "toolCall", id: "call-1", name: "report", arguments: {} }] });
    expect(checkResponse([text])).toEqual({ kind: "productive" });
    expect(checkResponse([assistantEnd({ content: [] }), toolCall])).toEqual({ kind: "productive" });
  });

  it("calls a turn aborted when an assistant message ended aborted, even if it had said something before", () => {
    const said = assistantEnd({ content: [{ type: "text", text: "Starting." }] });
    const aborted = assistantEnd({ stopReason: "aborted", errorMessage: "Request was aborted" });
    expect(checkResponse([said, aborted])).toEqual({ kind: "aborted" });
  });
});
