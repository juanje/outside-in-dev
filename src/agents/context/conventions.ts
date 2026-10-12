import { NEWLINE } from "../../artifacts/lines.js";
import { loadConventionPaths } from "../../artifacts/project-config.js";
import { readText } from "../../artifacts/project-json.js";
import { isSecret } from "../secrets.js";

/** The most characters of conventions text given to a task, over all the files. It is a budget of its own: a conventions file is a page or two of rules (this project's is under 4000 characters), so 8000 holds twice that and costs a task about as much as its step catalogue, while a file past it is a sign that the rules should be shortened or read on demand. */
const CONVENTIONS_BUDGET = 8000;

/** Where the section is introduced: the conventions are the project's own rules, and they win over the general guidance. */
const CONVENTIONS_HEADING = "Project conventions (the project's own rules for this work, written by the people who maintain it; they take precedence over the general guidance in this prompt wherever the two differ):";

/** What separates the names of files in a note. */
const FILE_SEPARATOR = ", ";

/** The text of `text` that fits `room` characters, cut after a whole line. */
function cutAtLine(text: string, room: number): string {
  const kept = text.slice(0, room);
  const end = kept.lastIndexOf(NEWLINE);
  return end < 0 ? "" : kept.slice(0, end);
}

/** The section of a prompt that holds the text of the project's conventions files, in order and within `budget` characters. A file that does not fit is cut after a whole line; it and the files after it are named, for the agent to read. A file that does not exist is skipped and named in a note; a secret file is skipped. Nothing (no lines) when the project lists no file or none is left to show. */
export function conventionsSection(cwd: string, budget: number = CONVENTIONS_BUDGET): string[] {
  const listed = loadConventionPaths(cwd).filter((file) => !isSecret(cwd, file));
  const texts = listed.map((file) => ({ file, text: readText(cwd, file) }));
  const missing = texts.filter(({ text }) => text === undefined).map(({ file }) => file);
  let room = budget;
  const shown: string[] = [];
  const unread: string[] = [];
  for (const { file, text } of texts) {
    if (text === undefined) continue;
    const kept = text.length <= room ? text : cutAtLine(text, room);
    room -= kept.length;
    if (kept !== "") shown.push([`### ${file}`, kept.trimEnd()].join(NEWLINE));
    if (kept.length < text.length) unread.push(file);
  }
  const notes = [
    ...(unread.length === 0 ? [] : [`Past the size limit of this section; read the rest in: ${unread.join(FILE_SEPARATOR)}`]),
    ...(missing.length === 0 ? [] : [`Listed as conventions but not found, skipped: ${missing.join(FILE_SEPARATOR)}`]),
  ];
  return shown.length === 0 && notes.length === 0 ? [] : [CONVENTIONS_HEADING, ...shown, ...notes];
}
