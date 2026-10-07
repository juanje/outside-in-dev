import { lstatSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { z } from "zod";
import { type Installer, installCommand } from "../../artifacts/git-dependencies.js";
import { textContent } from "../result-text.js";

const MAX_NAME_LENGTH = 214;
const NPM_NAME = /^(@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*$/;
const RANGE_OR_TAG = /^[0-9A-Za-z^~<>=*|.+][0-9A-Za-z^~<>=*|.+\- ]*$/;
const PARENT_SEGMENT = "..";

const name = z.string().max(MAX_NAME_LENGTH).regex(NPM_NAME).refine((value) => !value.includes(PARENT_SEGMENT));
const version = z.string().regex(RANGE_OR_TAG);
const reason = z.string().trim().min(1);
const requestShape = z.object({ name, version: version.optional(), dev: z.boolean(), reason }).strict();

/** What an agent asks for: a package, optionally at a version range or dist-tag, as a dev dependency or not, and why. */
export type DependencyRequest = z.infer<typeof requestShape>;

/** The request an agent's arguments describe, or `undefined` when the name is not a plain npm package name, the version is not a semver range or dist-tag, or the reason is empty. */
export function parseDependencyRequest(args: unknown): DependencyRequest | undefined {
  const parsed = requestShape.safeParse(args);
  return parsed.success ? parsed.data : undefined;
}

const MODULES_DIR = "node_modules";
const NPM = "npm";
const NPM_ADD = "install";
const OTHER_ADD = "add";
const DEV_FLAG = "-D";

/** The command that adds the requested package to the project in `dir`, with the package manager of its lockfile (npm without one). */
export function addCommand(dir: string, request: DependencyRequest): string[] {
  const manager = installCommand(dir)?.[0] ?? NPM;
  const spec = request.version === undefined ? request.name : `${request.name}@${request.version}`;
  return [manager, manager === NPM ? NPM_ADD : OTHER_ADD, ...(request.dev ? [DEV_FLAG] : []), spec];
}

/** The human's answer to a request: approved or not, with an optional note for the agent. */
export type DependencyDecision = { approved: boolean; note?: string };

/** What the tool needs from the orchestrator: where to install, who approves, and how to run the package manager. */
export type DependencyContext = { worktree: string; approve?: (request: DependencyRequest) => Promise<DependencyDecision>; install: Installer };

/** The name of the tool that asks for a package. */
const INVALID_REQUEST = "The request is not valid: name must be a plain npm package name, version a semver range or dist-tag, dev true or false, and reason not empty. Call request_dependency again.";
const NO_APPROVER = "Nobody is available to approve it.";
const REQUEST_DEPENDENCY_TOOL = "request_dependency";

/** When the worktree's `node_modules` is a link to the main copy's, replaces it with its own, installed from the lockfile, so the main copy is never changed. */
function materialiseModules({ worktree, install }: DependencyContext): void {
  const modules = join(worktree, MODULES_DIR);
  if (!lstatSync(modules, { throwIfNoEntry: false })?.isSymbolicLink()) return;
  unlinkSync(modules);
  const command = installCommand(worktree);
  if (command !== undefined) install(command, worktree);
}

function answer(text: string) {
  return { content: textContent(text), details: {} };
}

/** The `request_dependency` tool: the agent asks for a package with a reason, the injected approver decides, and the orchestrator installs it. */
export function requestDependencyTool(context: DependencyContext) {
  return defineTool({
    name: REQUEST_DEPENDENCY_TOOL,
    label: "Request dependency",
    description: "Ask for an npm package you need, with the reason. You cannot edit package.json or a lockfile or run a package manager: the orchestrator installs the package once it is approved.",
    parameters: Type.Object({
      name: Type.String(),
      version: Type.Optional(Type.String()),
      dev: Type.Boolean(),
      reason: Type.String(),
    }),
    async execute(_id, params) {
      const request = parseDependencyRequest(params);
      if (request === undefined) throw new Error(INVALID_REQUEST);
      const decision = (await context.approve?.(request)) ?? { approved: false, note: NO_APPROVER };
      if (!decision.approved) return answer(`The request was not approved.${decision.note === undefined ? "" : ` ${decision.note}`}`);
      try {
        materialiseModules(context);
        context.install(addCommand(context.worktree, request), context.worktree);
      } catch (error) {
        throw new Error(`The installation failed: ${(error as Error).message}`);
      }
      return answer(`Installed ${request.name}${request.version === undefined ? "" : `@${request.version}`}.`);
    },
  });
}
