/**
 * Self-verification: a spec-derived requirements ledger, harness verdicts per
 * line, and a completion gate that refuses an unverified "done".
 */

export type {
  CommandRecord,
  Finding,
  Ledger,
  LedgerEvidence,
  LedgerHandle,
  LedgerItem,
  LedgerKind,
  LedgerObservations,
  LedgerStatus,
  LedgerUpdate,
  LedgerVerdict,
  ToolRecord,
  UpdateResult,
} from "./types.js";
export { emptyObservations } from "./types.js";

export { extractRequirements, MAX_LEDGER_ITEMS } from "./extract.js";
export { renderLedgerPrompt, renderLedgerReminder, renderLedgerFile, parseLedgerFile } from "./render.js";
export { gateVerdict, gateNudge, blockingSummary, isBareCompletionClaim, type GateVerdict } from "./gate.js";
export { buildReport, reportSummary, countVerdicts, ledgerFile, type CheckRecord } from "./report.js";
export { verifyLedger, checkEvidence, limitVerdict, type VerifyResult, type VerifyContext } from "./verify.js";
export { createLedgerHandle } from "./update.js";
export { CodeIndex, type CodeHit } from "./code-index.js";
export {
  LEDGER_PATH,
  findSpecReference,
  loadSpec,
  readLedgerFile,
  writeLedgerFile,
  hydrate,
} from "./store.js";
export { LedgerRunner, type GateRun, type RunnerOptions } from "./runner.js";
export { scanStubs, scanStubFile, isScannableSource } from "./stubs.js";
export {
  parseTable,
  sanityCheckOutput,
  repeatedOutputFindings,
  type NumericRange,
  type Table,
} from "./sanity.js";
export { escapeRegExp, isCodePath, matchesEvidenceCommand, normalizeOutput } from "./text.js";