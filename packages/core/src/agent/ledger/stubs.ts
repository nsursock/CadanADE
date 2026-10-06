/**
 * Stub detector. Three families of hit, all of which mean "the work was not
 * actually done":
 *
 *  - marker words left in the code (TODO, "in practice", "would", placeholder,
 *    "not implemented")
 *  - functions whose entire body is `return <literal>`
 *  - imports that are never referenced again in the file
 *
 * Scoped by the caller to files the agent actually touched this turn, so old
 * debt in a workspace doesn't block every task.
 */

import type { Finding } from "./types.js";

const MARKERS: { re: RegExp; label: string }[] = [
  { re: /\bTODO\b/, label: 'TODO marker' },
  { re: /\bin practice\b/i, label: '"in practice" hedge' },
  { re: /\bwould\b/i, label: '"would" hedge' },
  { re: /\bplaceholder\b/i, label: "placeholder" },
  { re: /\bnot implemented\b/i, label: "not implemented" },
];

const LITERAL = String.raw`(?:true|false|null|undefined|NaN|-?\d+(?:\.\d+)?|["'\`][^"'\`\n]{0,80}["'\`])`;

const CONSTANT_RETURN_PATTERNS: RegExp[] = [
  // function foo() { return 42; }
  new RegExp(String.raw`\bfunction\s+\*?\s*(\w+)\s*\([^)]*\)\s*(?::[^{]+)?\{\s*return\s+(${LITERAL})\s*;?\s*\}`, "g"),
  // const foo = () => { return 42; }
  new RegExp(
    String.raw`\b(?:const|let|var)\s+(\w+)\s*(?::[^=]+?)?=\s*(?:async\s+)?(?:\([^)]*\)|\w+)\s*(?::[^=]+?)?=>\s*\{\s*return\s+(${LITERAL})\s*;?\s*\}`,
    "g",
  ),
  // method / getter: foo() { return 42; }
  new RegExp(
    String.raw`(?:^|[{;}\n])\s*(?:async\s+|get\s+|set\s+|static\s+|public\s+|private\s+|protected\s+)*([\w$]+)\s*\([^)]*\)\s*(?::[^{]+)?\{\s*return\s+(${LITERAL})\s*;?\s*\}`,
    "g",
  ),
];

const IMPORT_RE = /^[ \t]*(?:import|export)\s+(?:type\s+)?(?:(\*\s+as\s+[\w$]+)|(\{[^}]*\})|([\w$]+))\s*(?:from\s*)?["'][^"']+["']/gm;
const REQUIRE_RE = /(?:const|let|var)\s+(\{[^}]*\}|[\w$]+)\s*=\s*require\(\s*["'][^"']+["']\s*\)/g;

function lineAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) if (content[i] === "\n") line++;
  return line;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Blank out comment bodies (keeping line numbers) so bodies can be inspected. */
function stripComments(content: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, " ");
  return content
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, blank);
}

function bindingsFromClause(clause: string): string[] {
  const t = clause.trim();
  if (t.startsWith("*")) return [t.replace(/^\*\s*as\s*/, "").trim()];
  if (t.startsWith("{")) {
    return t
      .replace(/[{}]/g, "")
      .split(",")
      .map((part) => part.split(/\s+as\s+/).pop()?.trim())
      .filter((n): n is string => !!n);
  }
  return [t];
}

export function scanStubFile(path: string, content: string): Finding[] {
  const out: Finding[] = [];

  for (const { re, label } of MARKERS) {
    const rx = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = rx.exec(content))) {
      out.push({ path, line: lineAt(content, m.index), kind: "stub-marker", detail: label });
    }
  }

  const code = stripComments(content);
  for (const re of CONSTANT_RETURN_PATTERNS) {
    const rx = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = rx.exec(code))) {
      out.push({
        path,
        line: lineAt(code, m.index),
        kind: "constant-return",
        detail: `\`${m[1]}\` only returns a constant (${m[2].slice(0, 40)})`,
      });
    }
  }

  const body = content.replace(IMPORT_RE, "\n").replace(REQUIRE_RE, "\n");
  for (const rx of [IMPORT_RE, REQUIRE_RE]) {
    const scan = new RegExp(rx.source, rx.flags);
    let m: RegExpExecArray | null;
    while ((m = scan.exec(content))) {
      for (const name of bindingsFromClause(m[1] ?? m[2] ?? m[3] ?? "")) {
        if (!name) continue;
        const used = new RegExp(`(?<![\\w$])${escapeRe(name)}(?![\\w$])`);
        if (!used.test(body)) {
          out.push({
            path,
            line: lineAt(content, m.index),
            kind: "unused-import",
            detail: `import \`${name}\` is never used`,
          });
        }
      }
    }
  }

  return out.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
}

export function scanStubs(files: { path: string; content: string }[]): Finding[] {
  return files.flatMap((f) => scanStubFile(f.path, f.content));
}

/** Paths worth stub-scanning: source and script files the agent touched. */
export function isScannableSource(path: string): boolean {
  return /\.(?:[cm]?[jt]sx?|py|rs|go|rb|java|kt|swift|php|sh|bash|zsh|css|scss|svelte|vue)$/i.test(path);
}