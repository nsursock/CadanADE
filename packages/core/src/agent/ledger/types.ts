/**
 * Requirements ledger — the agent's own checklist for the spec it was handed,
 * plus the harness verdicts that decide whether "done" is allowed to be said.
 *
 * The ledger is derived mechanically from the spec (extract.ts), never from the
 * model's memory of it, and it is re-derived per turn so a drifted context
 * cannot quietly drop a requirement.
 */

export type LedgerKind =
  | "requirement"
  | "prohibition"
  | "limit"
  | "range"
  | "library"
  | "banned"
  | "deliverable";

/** What the model claims about a line. */
export type LedgerStatus = "todo" | "done" | "deviation";

/** What the harness measured. Never set by the model. */
export type LedgerVerdict = "pass" | "fail" | "deviation" | "unverified";

export interface LedgerEvidence {
  /** Shell command the model says produced the evidence. Verified against this turn. */
  command?: string;
  /** Verbatim excerpt. Must appear in a real tool result from this turn. */
  quote: string;
}

export interface LedgerItem {
  id: string;
  kind: LedgerKind;
  /** The spec line this came from, trimmed to something readable. */
  text: string;
  /** How this line gets checked — shown to the model and written to the file. */
  check: string;
  status: LedgerStatus;
  note?: string;
  evidence?: LedgerEvidence;
  verdict?: LedgerVerdict;
  /** Harness explanation: where it looked and what it found. */
  detail?: string;
  /** Searchable name for library / banned / deliverable lines. */
  subject?: string;
}

export interface Ledger {
  /** Workspace-relative spec file the ledger was derived from, when there was one. */
  specPath?: string;
  /** Spec lines the item cap left out — the spec still binds on those. */
  truncated?: number;
  items: LedgerItem[];
}

export interface CommandRecord {
  command: string;
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface ToolRecord {
  tool: string;
  text: string;
}

/** Everything the harness observed this turn — the basis for evidence checks. */
export interface LedgerObservations {
  tools: ToolRecord[];
  commands: CommandRecord[];
  /** Paths written/edited this turn — stub scanning is scoped to these. */
  writtenFiles: string[];
}

export interface Finding {
  path?: string;
  line?: number;
  kind: string;
  detail: string;
}

export interface LedgerUpdate {
  id: string;
  status: "done" | "deviation" | "todo";
  note?: string;
  evidence?: LedgerEvidence;
}

export type UpdateResult = { ok: true; item: LedgerItem } | { ok: false; error: string };

/** Passed to tool handlers so `update_ledger` can validate against real output. */
export interface LedgerHandle {
  ledger: Ledger;
  observations: LedgerObservations;
  recordToolResult(tool: string, text: string): void;
  recordCommand(rec: CommandRecord): void;
  noteWritten(path: string): void;
  update(input: LedgerUpdate): UpdateResult;
}

export function emptyObservations(): LedgerObservations {
  return { tools: [], commands: [], writtenFiles: [] };
}