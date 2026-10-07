/** One word of a command, with whether it holds an unquoted wildcard that the shell would expand. */
type Word = { text: string; glob: boolean };
/** A redirection to a file: `>` and `>>` write it, `<` reads it. */
type Redirect = { op: ">" | ">>" | "<"; target: string; glob: boolean };
export type SimpleCommand = { words: Word[]; redirects: Redirect[] };
export type Parsed = { ok: true; commands: SimpleCommand[] } | { ok: false; reason: string };

const SPACE = " ";
const PIPE = "|";
const AMP = "&";
const LT = "<";
const GT = ">";
const NEWLINE = "\n";
const SQUOTE = "'";
const DQUOTE = '"';
const BACKSLASH = "\\";
const PAIR = 2;

class Unsettled extends Error {}

const BLANKS = new Set([SPACE, "\t"]);
const OPERATORS = new Set([";", PIPE, AMP, LT, GT, NEWLINE]);
const WILDCARDS = new Set(["*", "?", "["]);
const SUBSTITUTIONS = new Set(["$", "`"]);
const GROUPING = new Set(["(", ")", "{", "}"]);
const DOUBLE_QUOTE_ESCAPES = new Set([DQUOTE, BACKSLASH]);
const DESCRIPTORS = /^(\d+|-)$/;
const DIGITS = /^\d+$/;

function fail(reason: string): never {
  throw new Unsettled(reason);
}

class Scanner {
  private pos = 0;
  private current: SimpleCommand = { words: [], redirects: [] };
  private readonly commands: SimpleCommand[] = [];

  constructor(private readonly source: string) {}

  run(): SimpleCommand[] {
    while (this.pos < this.source.length) this.step();
    this.endCommand();
    return this.commands;
  }

  private peek(offset = 0): string {
    return this.source.charAt(this.pos + offset);
  }

  private step(): void {
    const ch = this.peek();
    if (BLANKS.has(ch)) this.pos += 1;
    else if (ch === NEWLINE || ch === ";") this.separator(1);
    else if (ch === PIPE) this.pipe();
    else if (ch === AMP) this.ampersand();
    else if (ch === LT || ch === GT) this.redirect();
    else this.wordOrDescriptor();
  }

  private separator(length: number): void {
    this.pos += length;
    this.endCommand();
  }

  private endCommand(): void {
    if (this.current.words.length > 0 || this.current.redirects.length > 0) this.commands.push(this.current);
    this.current = { words: [], redirects: [] };
  }

  private pipe(): void {
    if (this.peek(1) === AMP) fail("the pipe `|&` cannot be checked");
    this.separator(this.peek(1) === PIPE ? PAIR : 1);
  }

  private ampersand(): void {
    if (this.peek(1) === AMP) this.separator(PAIR);
    else if (this.peek(1) === GT) {
      this.pos += 1;
      this.redirect();
    } else fail("a command in the background cannot be checked");
  }

  private wordOrDescriptor(): void {
    const word = this.readWord();
    const next = this.peek();
    if (DIGITS.test(word.text) && (next === GT || next === LT)) this.redirect();
    else this.current.words.push(word);
  }

  private redirect(): void {
    const ch = this.peek();
    if (ch === LT) {
      if (this.peek(1) === LT) fail("a here-document or here-string cannot be checked");
      this.pos += 1;
      this.addRedirect(LT);
      return;
    }
    const op = this.peek(1) === GT ? ">>" : GT;
    this.pos += op.length;
    if (this.peek() === PIPE) this.pos += 1;
    if (this.peek() === AMP) {
      this.pos += 1;
      this.addRedirect(op, true);
    } else this.addRedirect(op);
  }

  private addRedirect(op: Redirect["op"], descriptorAllowed = false): void {
    while (BLANKS.has(this.peek())) this.pos += 1;
    const ch = this.peek();
    if (ch === "" || OPERATORS.has(ch)) fail("a redirection has no target");
    const target = this.readWord();
    if (descriptorAllowed && DESCRIPTORS.test(target.text)) return;
    this.current.redirects.push({ op, target: target.text, glob: target.glob });
  }

  private readWord(): Word {
    let text = "";
    let glob = false;
    const start = this.pos;
    while (this.pos < this.source.length) {
      const ch = this.peek();
      if (BLANKS.has(ch) || OPERATORS.has(ch)) break;
      if (ch === SQUOTE) text += this.readSingleQuoted();
      else if (ch === DQUOTE) text += this.readDoubleQuoted();
      else if (ch === BACKSLASH) text += this.readEscaped();
      else {
        this.checkPlain(ch, this.pos === start);
        glob = glob || WILDCARDS.has(ch);
        text += ch;
        this.pos += 1;
      }
    }
    return { text, glob };
  }

  private checkPlain(ch: string, atStart: boolean): void {
    if (SUBSTITUTIONS.has(ch)) fail("a variable, command substitution or backtick cannot be checked");
    if (GROUPING.has(ch)) fail("a subshell, group or brace expansion cannot be checked");
    if (ch === "#" && atStart) fail("a comment cannot be checked");
  }

  private readEscaped(): string {
    const next = this.peek(1);
    if (next === "" || next === NEWLINE) fail("a trailing backslash cannot be checked");
    this.pos += PAIR;
    return next;
  }

  private readSingleQuoted(): string {
    const end = this.source.indexOf(SQUOTE, this.pos + 1);
    if (end < 0) fail("a quote is not closed");
    const text = this.source.slice(this.pos + 1, end);
    this.pos = end + 1;
    return text;
  }

  private readDoubleQuoted(): string {
    let text = "";
    this.pos += 1;
    while (this.peek() !== DQUOTE) {
      const ch = this.peek();
      if (ch === "") fail("a quote is not closed");
      if (SUBSTITUTIONS.has(ch)) fail("a variable, command substitution or backtick cannot be checked");
      if (ch === BACKSLASH && DOUBLE_QUOTE_ESCAPES.has(this.peek(1))) this.pos += 1;
      text += this.peek();
      this.pos += 1;
    }
    this.pos += 1;
    return text;
  }
}

/** Splits a command line into its simple commands, or says why it cannot: anything the shell would expand or run in a way that cannot be seen from the text is refused. */
export function parseShell(command: string): Parsed {
  try {
    return { ok: true, commands: new Scanner(command).run() };
  } catch (error) {
    if (error instanceof Unsettled) return { ok: false, reason: error.message };
    throw error;
  }
}
