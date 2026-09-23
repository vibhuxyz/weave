export type CommandClassification =
  | { readonly kind: "read-only"; readonly binary: string }
  | { readonly kind: "ask"; readonly reason: string };

const MAX_COMMAND_CHARS = 4096;
const MAX_COMMAND_WORDS = 256;

/**
 * Characters that chain, redirect or run a second command.
 *
 * Braces are not among them: `--exclude-dir={node_modules,dist}` is brace
 * expansion, which only produces more words. A shell group — `{ ls; rm x; }` —
 * needs a `;` or `&` inside it, and those are still refused here.
 */
const CONTROL_CHARACTERS: ReadonlySet<string> = new Set([
  "|", "&", ";", "<", ">", "(", ")", "\n", "\r",
]);

/** Characters that let the shell run something else and paste its output in. */
const EXPANSION_CHARACTERS: ReadonlySet<string> = new Set(["$", "`"]);

/**
 * Commands that only report. Bare names only — `./configure` and `/bin/sh` are
 * not on this list and must not be able to look like something that is.
 */
const READ_ONLY_BINARIES: ReadonlySet<string> = new Set([
  "basename", "cat", "df", "dirname", "du", "egrep", "fgrep", "file", "find",
  "git", "grep", "head", "ls", "pwd", "rg", "stat", "tail", "tree", "wc", "which",
]);

/** `find` actions that write, delete or run other programs. */
const FIND_MUTATING_FLAGS: ReadonlySet<string> = new Set([
  "-delete", "-exec", "-execdir", "-ok", "-okdir", "-fls", "-fprint", "-fprint0", "-fprintf",
]);

/** Flags that make a reader wait for more input, which would hang the turn. */
const FOLLOW_FLAGS: ReadonlySet<string> = new Set(["-f", "--follow", "-F"]);

const GIT_READ_ONLY_SUBCOMMANDS: ReadonlySet<string> = new Set([
  "blame", "describe", "diff", "log", "ls-files", "rev-parse", "shortlog", "show", "status",
]);

const GIT_OUTPUT_FLAG = "--output";

type Scan =
  | { readonly kind: "words"; readonly words: readonly string[] }
  | { readonly kind: "unsafe"; readonly reason: string };

function ask(reason: string): CommandClassification {
  return { kind: "ask", reason };
}

/**
 * Split a command the way a shell would, refusing anything that could become
 * more than the one command it appears to be.
 *
 * Quoting is tracked rather than pattern-matched: `grep -E '^a |^b' file` is a
 * single read of one file, and a check that only looked for a `|` anywhere
 * would send it to the user as if it were a pipeline.
 */
function scanWords(command: string): Scan {
  const words: string[] = [];
  const word = { text: "", started: false };
  let quote: "'" | '"' | null = null;

  const endWord = () => {
    if (!word.started) return;
    words.push(word.text);
    word.text = "";
    word.started = false;
  };

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (char === undefined) break;
    if (words.length >= MAX_COMMAND_WORDS) return { kind: "unsafe", reason: "too many words to check" };

    if (quote === "'") {
      if (char === "'") quote = null;
      else word.text += char;
      continue;
    }

    if (quote === '"') {
      if (char === "\\") {
        const escaped = command[index + 1];
        if (escaped !== undefined) {
          word.text += escaped;
          index += 1;
        }
        continue;
      }
      if (EXPANSION_CHARACTERS.has(char)) {
        return { kind: "unsafe", reason: `runs a shell expansion (${char})` };
      }
      if (char === '"') quote = null;
      else word.text += char;
      continue;
    }

    if (char === "\\") {
      const escaped = command[index + 1];
      if (escaped !== undefined) {
        word.text += escaped;
        word.started = true;
        index += 1;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      word.started = true;
      continue;
    }
    if (char === " " || char === "\t") {
      endWord();
      continue;
    }
    if (CONTROL_CHARACTERS.has(char)) {
      return { kind: "unsafe", reason: `chains or redirects with ${char}` };
    }
    if (EXPANSION_CHARACTERS.has(char)) {
      return { kind: "unsafe", reason: `runs a shell expansion (${char})` };
    }

    word.text += char;
    word.started = true;
  }

  if (quote !== null) return { kind: "unsafe", reason: "has an unbalanced quote" };
  endWord();
  return { kind: "words", words };
}

function classifyWords(words: readonly string[]): CommandClassification {
  const binary = words[0];
  if (binary === undefined) return ask("is empty");
  if (binary.includes("/")) return ask("names a program by path");
  if (!READ_ONLY_BINARIES.has(binary)) return ask(`${binary} is not a read-only command`);

  const args = words.slice(1);

  if (binary === "find") {
    const action = args.find((arg) => FIND_MUTATING_FLAGS.has(arg));
    if (action) return ask(`find ${action} can change files or run programs`);
  }

  if (binary === "tail" || binary === "head") {
    const follow = args.find((arg) => FOLLOW_FLAGS.has(arg));
    if (follow) return ask(`${binary} ${follow} would not finish`);
  }

  if (binary === "git") {
    const subcommand = args[0];
    if (subcommand === undefined) return ask("git was given no subcommand");
    if (!GIT_READ_ONLY_SUBCOMMANDS.has(subcommand)) return ask(`git ${subcommand} is not read-only`);
    if (args.some((arg) => arg.startsWith(GIT_OUTPUT_FLAG))) return ask("git --output writes a file");
  }

  return { kind: "read-only", binary };
}

/**
 * Whether a command only reads, and can be answered without asking the user.
 *
 * Deliberately narrow: everything it cannot prove harmless is sent to the user,
 * so a new shape of command costs a prompt, never an unattended write.
 */
export function classifyCommand(command: string): CommandClassification {
  if (command.length > MAX_COMMAND_CHARS) return ask("is too long to check");
  const scan = scanWords(command);
  if (scan.kind === "unsafe") return ask(scan.reason);
  return classifyWords(scan.words);
}
