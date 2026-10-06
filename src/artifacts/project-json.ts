import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseJsonc, printParseErrorCode, type ParseError } from "jsonc-parser";
import { ProgressError } from "./progress.js";

export const TSCONFIG_FILE = "tsconfig.json";

/** Parses the text of a project file: tsconfig.json as JSON with comments and trailing commas, the rest as strict JSON. */
function parseProjectJson(name: string, text: string): unknown {
  if (name !== TSCONFIG_FILE) {
    try {
      return JSON.parse(text);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      throw new ProgressError(`${name} is not valid JSON: ${error.message}`);
    }
  }
  const errors: ParseError[] = [];
  const document: unknown = parseJsonc(text, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    const { error, offset } = errors[0]!;
    throw new ProgressError(`${name} is not valid JSON: ${printParseErrorCode(error)} at offset ${offset}`);
  }
  return document;
}

/** Reads a JSON file of the project; undefined when it does not exist. The content is not trusted. */
export function readJson(cwd: string, name: string): unknown {
  const text = readText(cwd, name);
  return text === undefined ? undefined : parseProjectJson(name, text);
}

export function readText(cwd: string, name: string): string | undefined {
  const path = join(cwd, name);
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}
