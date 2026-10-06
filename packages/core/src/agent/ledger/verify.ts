/**
 * Harness checks. These need no project knowledge: they read the spec-derived
 * ledger, look at what the agent actually did this turn, and decide a verdict
 * per line. The model's own claim is never the deciding input — only its
 * evidence, which is matched against real tool output.
 *
 * A recorded DEVIATION always wins over a failing check, but it is surfaced in
 * the report: the point is that nothing is ever substituted silently.
 */

import { CodeIndex, type CodeHit } from "./code-index.js";
import { checkEvidence, limitVerdict } from "./evidence.js";
import { repeatedOutputFindings, sanityCheckOutput, type NumericRange } from "./sanity.js";
import { escapeRegExp } from "./text.js";
import type { Finding, Ledger, LedgerItem, LedgerObservations, LedgerVerdict } from "./types.js";
import type { WorkspaceService } from "../../services/workspace-service.js";

export interface VerifyContext {
  workspace: WorkspaceService;
  root: string;
  observations: LedgerObservations;
  /** Spec file the ledger came from — excluded from code scans, it names every dependency. */
  specPath?: string;
}

export interface VerifyResult {
  ledger: Ledger;
  /** Findings that block a "done" claim. */
  blockers: Finding[];
  /** Plausibility and labeling notes that don't block. */
  warnings: Finding[];
}

const MANIFESTS = [
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "composer.json",
  "Gemfile",
  "pom.xml",
  "build.gradle",
  "pubspec.yaml",
  "mix.exs",
];

const TEST_COMMAND_RE =
  /\b(?:pytest|vitest|jest|mocha|npm\s+(?:run\s+)?test|pnpm\s+(?:run\s+)?test|yarn\s+test|go\s+test|cargo\s+test|ctest|rake\s+test|unittest)\b/i;

/** Command evidence that shrinks what was actually run. */
const REDUCED_RE =
  /(?:\s-k\s+|\bhead\b\s+-|\|\s*head\b|--limit\b|--max[_-]\w+\b|--first\b|--last\b|--sample\b|--subset\b|--skip\b|\bsmoke\b|--exclude\b|--shard\b|-x\s*\.git\b|--iterations?\s+\d)/i;

const NOTE_REDUCED_RE =
  /\b(reduc\w+|subset|smaller|fewer (?:rows|items|tests|cases|samples)|sampl\w+|scaled down|trimmed|mocked|stubbed out|faked|placeholder for)\b/i;

type LineVerdict = { verdict: LedgerVerdict; detail: string };

async function searchCode(index: CodeIndex, pattern: string): Promise<CodeHit[]> {
  try {
    return await index.find(new RegExp(pattern, "i"));
  } catch {
    return [];
  }
}

function places(hits: { path: string; line: number }[], max = 3): string {
  return hits
    .slice(0, max)
    .map((h) => `${h.path}:${h.line}`)
    .join(", ");
}

function identOf(subject: string): string {
  const scoped = subject.startsWith("@") ? subject.split("/")[1] : subject;
  return scoped.replace(/\.(?:js|jsx|ts|tsx|mjs|cjs)$/i, "");
}

async function verifyLibrary(item: LedgerItem, ctx: VerifyContext, index: CodeIndex): Promise<LineVerdict> {
  const subject = item.subject ?? "";
  const esc = escapeRegExp(subject);
  const ident = escapeRegExp(identOf(subject));
  const importRe = `(?:from\\s*["']${esc}(?:[/"']|$)|require\\(\\s*["']${esc}(?:[/"']|$)|^[ \\t]*(?:import|use)\\s+${esc}\\b|\\bfrom\\s+${esc}\\s+import\\b)`;
  const callRe = `(?<![\\w$])${ident}\\s*[.(]`;

  const imports = await searchCode(index, importRe);
  if (!imports.length) {
    return { verdict: "fail", detail: `no import of \`${subject}\` anywhere in the workspace` };
  }
  const calls = await searchCode(index, callRe);
  if (!calls.length) {
    return { verdict: "fail", detail: `\`${subject}\` is imported (${places(imports)}) but never called` };
  }
  const deps = await index.dependencyText();
  const declared = deps.toLowerCase().includes(subject.toLowerCase());
  return {
    verdict: "pass",
    detail: `imported at ${places(imports)} · called at ${places(calls)}${declared ? "" : " · not in any dependency file"}`,
  };
}

async function verifyBanned(item: LedgerItem, index: CodeIndex): Promise<LineVerdict> {
  const subject = item.subject ?? "";
  const esc = escapeRegExp(subject);
  const hits = await searchCode(index, `(?<![\\w$@/-])${esc}(?![\\w-])`);
  const deps = await index.dependencyText();
  const depLines = deps
    .split("\n")
    .filter((l) => l.toLowerCase().includes(subject.toLowerCase()))
    .slice(0, 3)
    .map((l) => l.trim().slice(0, 80));
  if (hits.length || depLines.length) {
    const where = [...hits.slice(0, 3).map((h) => `${h.path}:${h.line}`), ...depLines.map((l) => `deps: ${l}`)];
    return { verdict: "fail", detail: `\`${subject}\` still present — ${where.join(", ")}` };
  }
  return { verdict: "pass", detail: `no reference to \`${subject}\` in code or dependency files` };
}

async function verifyDeliverable(item: LedgerItem, ctx: VerifyContext): Promise<LineVerdict> {
  const subject = (item.subject ?? "").trim();
  if (!subject) return { verdict: "fail", detail: "no deliverable named on this line" };
  try {
    if (subject.endsWith("/")) {
      const entries = await ctx.workspace.listFlat(ctx.root, subject.replace(/\/$/, ""));
      if (!entries.length) return { verdict: "fail", detail: `\`${subject}\` is empty` };
      return { verdict: "pass", detail: `${entries.length} file(s) under \`${subject}\`` };
    }
    const file = await ctx.workspace.readFile(ctx.root, subject);
    if (!file.content.trim()) return { verdict: "fail", detail: `\`${subject}\` exists but is empty` };
    const touched = ctx.observations.writtenFiles.includes(file.path);
    return {
      verdict: "pass",
      detail: `\`${subject}\` exists, ${file.content.length} chars${touched ? "" : " (not written this turn)"}`,
    };
  } catch {
    return { verdict: "fail", detail: `\`${subject}\` does not exist` };
  }
}

async function verifyItem(item: LedgerItem, ctx: VerifyContext, index: CodeIndex): Promise<LineVerdict> {
  if (item.kind === "library") return verifyLibrary(item, ctx, index);
  if (item.kind === "banned") return verifyBanned(item, index);
  if (item.kind === "deliverable") return verifyDeliverable(item, ctx);

  const evidence = checkEvidence(item, ctx.observations);
  if (!evidence.ok) return { verdict: "unverified", detail: evidence.problem ?? "no evidence" };
  if (item.kind === "limit") return limitVerdict(item, evidence);

  // A line about tests is not satisfied by a benchmark or a build log.
  if (/\btests?\b|\bcoverage\b/i.test(item.text) && item.evidence?.command) {
    if (!TEST_COMMAND_RE.test(item.evidence.command)) {
      return {
        verdict: "fail",
        detail: `this line is about tests but the evidence came from \`${item.evidence.command}\`, which is not a test runner`,
      };
    }
  }
  return { verdict: "pass", detail: `evidence: ${evidence.where}` };
}

/** Intervals the spec stated explicitly ("score between 0 and 1"). */
function declaredRanges(ledger: Ledger): NumericRange[] {
  const out: NumericRange[] = [];
  for (const item of ledger.items) {
    if (item.kind !== "range" || !item.subject) continue;
    const [min, max] = item.subject.split("..").map(Number);
    if (Number.isFinite(min) && Number.isFinite(max)) out.push({ min, max, label: item.text });
  }
  return out;
}

/** Parameters, data or tests that were shrunk to get a pass. */
function reducedRunWarnings(ledger: Ledger): Finding[] {
  const out: Finding[] = [];
  for (const item of ledger.items) {
    const cmd = item.evidence?.command;
    if (cmd && REDUCED_RE.test(cmd)) {
      out.push({
        kind: "reduced-run",
        detail: `${item.id}: evidence came from a narrowed run — \`${cmd.slice(0, 70)}\``,
      });
    }
    const note = item.note ?? "";
    if (NOTE_REDUCED_RE.test(note)) {
      out.push({ kind: "reduced-run", detail: `${item.id}: note reports a reduced run — "${note.slice(0, 90)}"` });
    }
  }
  return out;
}

export async function verifyLedger(ledger: Ledger, ctx: VerifyContext): Promise<VerifyResult> {
  const blockers: Finding[] = [];
  const warnings: Finding[] = [];
  const index = new CodeIndex(ctx.workspace, ctx.root, {
    ...(ctx.specPath ? { exclude: [ctx.specPath] } : {}),
    manifests: MANIFESTS,
  });

  for (const item of ledger.items) {
    if (item.status === "deviation") {
      item.verdict = "deviation";
      item.detail = item.note ?? "deviation recorded without a reason";
      continue;
    }
    try {
      const { verdict, detail } = await verifyItem(item, ctx, index);
      item.verdict = verdict;
      item.detail = detail;
      if (verdict === "fail" || verdict === "unverified") {
        blockers.push({ kind: `ledger:${item.id}`, detail: `${item.text} — ${detail}` });
      }
    } catch (e) {
      item.verdict = "unverified";
      item.detail = e instanceof Error ? e.message : String(e);
      blockers.push({ kind: `ledger:${item.id}`, detail: `${item.text} — check could not run (${item.detail})` });
    }
  }

  warnings.push(...repeatedOutputFindings(ctx.observations.commands));
  const ranges = declaredRanges(ledger);
  for (const rec of ctx.observations.commands.slice(-6)) {
    if (!rec.stdout.trim()) continue;
    for (const f of sanityCheckOutput(rec.stdout, ranges)) {
      warnings.push({ ...f, detail: `\`${rec.command.slice(0, 50)}\`: ${f.detail}` });
    }
  }
  warnings.push(...reducedRunWarnings(ledger));

  return { ledger, blockers, warnings };
}

export { checkEvidence, limitVerdict, MIN_QUOTE } from "./evidence.js";