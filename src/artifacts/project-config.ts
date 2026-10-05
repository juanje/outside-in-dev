import { z } from "zod";
import { ProgressError } from "./progress.js";

export const CONFIG_FILE = ".outside-in.json";

const globs = z.array(z.string());
const command = z.string().nullable();

const projectConfigSchema = z.strictObject({
  version: z.literal(1),
  stack: z.literal("typescript"),
  paths: z.strictObject({
    source: globs,
    shared: globs,
    unit_tests: globs,
    bdd_features: globs,
    bdd_steps: globs,
    docs: globs,
    spec: z.string(),
    design: globs,
    progress: z.string(),
  }),
  commands: z.strictObject({
    bdd: z.string(),
    unit: z.string(),
    typecheck: z.string(),
    format: command,
    lint: command,
    coverage: command,
    extra_checks: z.array(z.string()),
  }),
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;

/** Returns the document as a project configuration, or throws naming every invalid field. */
export function parseProjectConfig(document: unknown): ProjectConfig {
  const result = projectConfigSchema.safeParse(document);
  if (result.success) return result.data;
  const problems = result.error.issues.map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  throw new ProgressError(`${CONFIG_FILE} is invalid:\n${problems.join("\n")}`);
}
