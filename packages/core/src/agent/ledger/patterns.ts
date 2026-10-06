/**
 * Spec vocabulary: the words, units and name shapes that decide what kind of
 * obligation a line is. Kept apart from the pipeline so the patterns can be
 * read — and adjusted — in one place.
 */

export const REQUIREMENT_RE =
  /\b(?:must|must not|shall|shall not|required|requires|is required|needs? to|has to|have to|make sure|ensure|mandatory)\b/i;
export const PROHIBITION_RE =
  /\b(?:do not|don'?t|never|avoid|without|forbidden|banned|prohibited|not allowed|no longer allowed|shall not|shalln'?t)\b/i;
export const STRICT_RE = /\b(?:strict(?:ly)?|exactly|verbatim|identical|unchanged)\b/i;

export const LIMIT_RE =
  /(?:\b(?:under|below|less than|fewer than|no more than|not more than|at most|maximum|max|within|up to|about|approx\.?)\s+|(?:<=|<=|≤|<)\s*)~?\s*(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|secs?|seconds?|m|min|mins|minutes?|h|hours?|kb|mb|gb|bytes?|lines?|chars?|characters?|tokens?|rows?|records?|items?|files?|entries)\b(?:\s*(?:or less|or fewer|or below|or under|max))?/i;
export const LIMIT_TRAILING_RE =
  /(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|secs?|seconds?|kb|mb|gb|lines?|tokens?|rows?|files?)\s+(?:or less|or fewer|or below|or under|max)\b/i;
/** An explicit interval — the only kind of number that bounds a reported value. */
export const RANGE_RE =
  /\bbetween\s+(-?\d+(?:\.\d+)?)\s*(?:and|to|-|–)\s*(-?\d+(?:\.\d+)?)\b|\bfrom\s+(-?\d+(?:\.\d+)?)\s+to\s+(-?\d+(?:\.\d+)?)\b/i;

/** Phrases that mark a mentioned file as something to produce, not to read. */
export const DELIVERABLE_RE =
  /\b(?:create|creates|creating|add|adds|adding|write|writes|produce|generat(?:e|es)|deliver|output|save|ship|emit|export|include)\b/i;

export const PROSE_PACKAGE_RE =
  /\b(?:us(?:e|es|ing)|with|via|based on|built (?:on|with)|powered by|through)\s+[`'"]?([A-Za-z@][\w@./+-]{1,40})[`'"]?/g;
export const PROSE_PATH_RE =
  /\b((?:[\w.-]+\/)*[\w.-]+\.(?:md|mdx|txt|rst|py|ts|tsx|js|jsx|mjs|cjs|json|toml|yaml|yml|cfg|ini|sql|sh|rs|go|rb|java|kt|html|css|py))\b/g;

/**
 * The dependency a prohibition bans, read only from directly after the cue.
 *
 * Scanning the whole sentence for package names instead would ban the wrong
 * one: "keep @cadan/core client-safe (never pull node:crypto …)" bans
 * `node:crypto`, not the package the sentence is mostly about.
 */
export const BAN_CUE_RE =
  /\b(?:do not use|don'?t use|must not use|shall not use|never use|never|without|avoid|banned|forbidden|prohibited|exclude|drop|remove)\s+(?:\w+\s+)?(?:the\s+|any\s+|all\s+)?[`'"*]*([A-Za-z@][\w@./+:_-]{1,40})/gi;

export const MIN_CANDIDATE_CHARS = 25;

const UNIT_CANON: Record<string, string> = {
  milliseconds: "ms",
  millisecond: "ms",
  ms: "ms",
  secs: "s",
  sec: "s",
  seconds: "s",
  s: "s",
  mins: "minutes",
  min: "minutes",
  minutes: "minutes",
  m: "minutes",
  hours: "hours",
  h: "hours",
  kb: "kb",
  mb: "mb",
  gb: "gb",
  bytes: "bytes",
  byte: "bytes",
  lines: "lines",
  chars: "chars",
  characters: "chars",
  tokens: "tokens",
  rows: "rows",
  records: "rows",
  items: "items",
  files: "files",
  entries: "rows",
};

const CODE_EXT = new Set([
  "md", "mdx", "txt", "rst", "py", "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "toml",
  "yaml", "yml", "cfg", "ini", "sql", "sh", "rs", "go", "rb", "java", "kt", "html", "css", "csv",
]);

/** Never a deliverable, whatever the spec says. */
const SELF_PATHS = new Set([".cadan/requirements.md", "requirements.md"]);

/** Prose words that survive the code-span pass but are not package names. */
const NOT_A_PACKAGE = new Set([
  "the", "this", "that", "it", "any", "all", "new", "other", "others", "more", "less", "fewer",
  "use", "using", "reason", "way", "thing", "things", "code", "file", "files", "test", "tests",
  "extra", "work", "stuff", "or", "and", "not", "no", "your", "you", "me", "them", "same", "own",
]);

export function namedSpans(line: string): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(/`([^`\n]{1,60})`/g)) out.push(m[1].trim());
  for (const m of line.matchAll(/\*\*([^*\n]{1,60})\*\*/g)) out.push(m[1].trim());
  for (const m of line.matchAll(/(?:^|\s)"([^"\n]{1,60})"(?:\s|$|[.,;])/g)) out.push(m[1].trim());
  return out.filter(Boolean);
}

export function isPackageLike(name: string): boolean {
  const n = name.trim();
  if (!n || NOT_A_PACKAGE.has(n.toLowerCase())) return false;
  if (n.includes(" ")) return false;
  return (
    /^@[\w.-]+\/[\w.-]+$/.test(n) || // @scope/pkg
    /^[\w.-]+:[\w./-]+$/.test(n) || // node:crypto
    /^[\w.-]+\.(?:js|jsx|ts|tsx|mjs|cjs|py|rb|go|rs|java|kt|swift|php|sh)$/.test(n) || // pkg.js
    /^[a-z0-9][\w]*(?:-[a-z0-9]+)+(?:@[~^]?[\d][\w.]*)?$/.test(n) || // kebab-name
    /^[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+$/.test(n) || // CodeMirror
    /^[A-Z][A-Z0-9]{2,}$/.test(n) // GSAP
  );
}

export function isPathLike(name: string): boolean {
  const n = name.trim().replace(/\/$/, "");
  if (!n || n.includes(" ")) return false;
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(n);
  return !!m && CODE_EXT.has(m[1].toLowerCase());
}

export function isSelfPath(name: string): boolean {
  return SELF_PATHS.has(name.toLowerCase());
}

export function limitFrom(line: string): { value: number; unit: string } | null {
  const m = LIMIT_RE.exec(line) ?? LIMIT_TRAILING_RE.exec(line);
  if (!m) return null;
  const value = Number(m[1]);
  const unit = UNIT_CANON[m[2].toLowerCase()] ?? m[2].toLowerCase();
  if (!Number.isFinite(value) || !unit) return null;
  return { value, unit };
}