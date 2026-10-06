/**
 * Plausibility checks on results, run before anything is reported as a result.
 *
 * These catch the class of failure where the harness is green because the thing
 * under test produced nothing: zero variance across repeated runs, duplicated
 * rows, columns that never change, and values outside a range the spec stated.
 */

import { normalizeOutput } from "./text.js";
import type { CommandRecord, Finding } from "./types.js";

export interface NumericRange {
  min: number;
  max: number;
  /** The spec sentence the interval came from — used to find the right column. */
  label: string;
}

export interface Table {
  header: string[];
  rows: string[][];
}

const DELIMITERS: { re: RegExp; name: string }[] = [
  { re: /\|/g, name: "|" },
  { re: /\t/g, name: "tab" },
  { re: /,/g, name: "," },
  { re: /\s{2,}/g, name: "space" },
];

const MAX_FINDINGS = 8;

function splitLine(line: string, re: RegExp): string[] {
  return line
    .split(new RegExp(re.source, re.flags))
    .map((c) => c.trim().replace(/^["']|["']$/g, ""))
    .filter((c, i, arr) => !(i === arr.length - 1 && c === ""));
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

function looksLikeHeader(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => c.length > 0 && !/^-?\d+(?:\.\d+)?$/.test(c));
}

/** JSON array-of-objects or a delimited text table, else null. */
export function parseTable(text: string): Table | null {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.rows) || Array.isArray(parsed?.results) || Array.isArray(parsed?.data)
          ? (parsed.rows ?? parsed.results ?? parsed.data)
          : null;
      if (Array.isArray(arr) && arr.length >= 2 && arr.every((r) => r && typeof r === "object" && !Array.isArray(r))) {
        const header = [...new Set(arr.flatMap((r) => Object.keys(r)))];
        const rows = arr.map((r) => header.map((h) => stringify(r[h])));
        return { header, rows };
      }
    } catch {
      /* not JSON — fall through to the text table */
    }
  }

  const lines = trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 3) return null;

  for (const { re } of DELIMITERS) {
    const usable = lines.filter((l) => !isSeparatorRow(splitLine(l, re)));
    if (usable.length < 3) continue;
    const counts = usable.map((l) => splitLine(l, re).length);
    const columns = Math.max(...counts);
    if (columns < 2) continue;
    const consistent = counts.filter((c) => c === columns).length / counts.length;
    if (consistent < 0.6) continue;
    const parsed = usable.map((l) => splitLine(l, re));
    const header = looksLikeHeader(parsed[0])
      ? parsed[0]
      : parsed[0].map((_, i) => `col${i + 1}`);
    const rows = looksLikeHeader(parsed[0]) ? parsed.slice(1) : parsed;
    if (rows.length < 2) continue;
    return { header, rows };
  }
  return null;
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}



const RANGE_STOPWORDS = new Set([
  "must", "should", "the", "and", "for", "with", "that", "this", "from", "between", "values",
  "value", "are", "not", "less", "than", "report", "reported", "within", "range", "each",
  "per", "under", "over", "maximum", "minimum", "stay", "keep", "hold", "have", "has", "will",
  "your", "you", "its", "every", "always", "never", "may", "can", "use", "using", "used",
]);

/**
 * Columns a declared interval applies to. Matching on words shared with the
 * column header keeps a limit about scores from being applied to an id column.
 */
export function rangeColumns(header: string[], label: string): number[] {
  const tokens = (label.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) ?? []).filter(
    (t) => !RANGE_STOPWORDS.has(t),
  );
  const cols: number[] = [];
  header.forEach((h, i) => {
    const hl = h.toLowerCase();
    if (hl && tokens.some((t) => hl.includes(t) || (hl.length > 2 && t.includes(hl)))) cols.push(i);
  });
  return cols;
}

export function sanityCheckOutput(text: string, ranges: NumericRange[] = []): Finding[] {
  const table = parseTable(text);
  if (!table) return [];
  const out: Finding[] = [];
  const { header, rows } = table;

  const seen = new Map<string, number>();
  for (const row of rows) {
    const key = normalizeOutput(row.join(" | ")).toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const dupes = [...seen.entries()].filter(([, n]) => n > 1);
  for (const [key, n] of dupes.slice(0, 3)) {
    out.push({ kind: "duplicate-rows", detail: `${n} identical row(s): "${key.slice(0, 80)}"` });
  }

  for (let c = 0; c < header.length && out.length < MAX_FINDINGS; c++) {
    const values = rows.map((r) => normalizeOutput(r[c] ?? "").toLowerCase());
    if (values.some((v) => v === "")) continue;
    if (new Set(values).size === 1 && rows.length >= 2 && header.length >= 2) {
      out.push({ kind: "constant-column", detail: `column "${header[c]}" is ${values[0]} in all ${rows.length} rows` });
    }
  }

  for (const range of ranges) {
    const cols = rangeColumns(header, range.label);
    if (!cols.length) continue;
    for (const row of rows.slice(0, 50)) {
      for (const c of cols) {
        const cell = (row[c] ?? "").trim();
        const n = Number(cell);
        if (!cell || !Number.isFinite(n)) continue;
        if (n < range.min) {
          out.push({ kind: "out-of-range", detail: `${header[c] ?? `col${c + 1}`}=${n} is below ${range.min} (${range.label})` });
        } else if (n > range.max) {
          out.push({ kind: "out-of-range", detail: `${header[c] ?? `col${c + 1}`}=${n} is above ${range.max} (${range.label})` });
        }
      }
    }
  }

  return out.slice(0, MAX_FINDINGS);
}

/** Same command twice, byte-identical output — a run that measured nothing. */
export function repeatedOutputFindings(commands: CommandRecord[]): Finding[] {
  const out: Finding[] = [];
  const byCommand = new Map<string, Set<string>>();
  for (const rec of commands) {
    const key = normalizeOutput(rec.command);
    if (!key) continue;
    const outputs = byCommand.get(key) ?? new Set<string>();
    outputs.add(normalizeOutput(`${rec.stdout}\n${rec.stderr}`));
    byCommand.set(key, outputs);
  }
  for (const [command, outputs] of byCommand) {
    const runs = [...outputs];
    if (runs.length >= 1 && outputs.size === 1 && commands.filter((c) => normalizeOutput(c.command) === command).length >= 2) {
      const preview = runs[0]?.slice(0, 60) ?? "";
      out.push({
        kind: "zero-variance",
        detail: `\`${command.slice(0, 60)}\` repeated with identical output (${preview || "empty"}) — it may not exercise anything`,
      });
    }
  }
  return out;
}