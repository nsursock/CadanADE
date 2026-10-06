/**
 * One turn of gate work: sync what the agent touched, run the harness checks,
 * run the stub detector over the files it changed, and build the report. Cached
 * by the engine so the completion gate and the final report agree.
 */

import { isScannableSource, scanStubs } from "./stubs.js";
import { gateVerdict, type GateVerdict } from "./gate.js";
import { buildReport, ledgerFile, reportSummary, type CheckRecord } from "./report.js";
import { verifyLedger } from "./verify.js";
import type { Finding, LedgerHandle } from "./types.js";
import type { WorkspaceService } from "../../services/workspace-service.js";

export interface GateRun {
  verdict: GateVerdict;
  blockers: Finding[];
  warnings: Finding[];
  report: string;
  summary: string;
  ledgerFile: string;
}

export interface RunnerOptions {
  workspace: WorkspaceService;
  root: string;
  handle: LedgerHandle;
  /** Paths the agent wrote or edited this turn — stub scanning is scoped to these. */
  writtenThisTurn: Set<string>;
}

const MAX_SCANNED_FILES = 25;

export class LedgerRunner {
  constructor(private opts: RunnerOptions) {}

  async run(checks: CheckRecord[] = []): Promise<GateRun> {
    const { workspace, root, handle } = this.opts;
    handle.observations.writtenFiles = [...this.opts.writtenThisTurn];

    const stubHits = await this.scanStubs();
    const { blockers, warnings } = await verifyLedger(handle.ledger, {
      workspace,
      root,
      observations: handle.observations,
      ...(handle.ledger.specPath ? { specPath: handle.ledger.specPath } : {}),
    });

    const allBlockers = [...blockers, ...stubHits];
    const report = buildReport({
      ledger: handle.ledger,
      blockers: allBlockers,
      warnings,
      checks,
    });

    return {
      verdict: gateVerdict(handle.ledger, allBlockers),
      blockers: allBlockers,
      warnings,
      report,
      summary: reportSummary(handle.ledger, allBlockers),
      ledgerFile: ledgerFile(handle.ledger, allBlockers),
    };
  }

  private async scanStubs(): Promise<Finding[]> {
    const { workspace, root } = this.opts;
    const paths = [...this.opts.writtenThisTurn].filter(isScannableSource).slice(0, MAX_SCANNED_FILES);
    const hits: Finding[] = [];
    for (const p of paths) {
      try {
        const file = await workspace.readFile(root, p);
        hits.push(...scanStubs([{ path: p, content: file.content }]));
      } catch {
        /* deleted or unreadable — nothing to scan */
      }
    }
    return hits;
  }
}