/**
 * The `update_ledger` tool's engine room. A model may claim a line is done, but
 * the claim only sticks if the evidence turns up in output the harness actually
 * saw. A claim without that is rejected here, not argued about later.
 */

import { checkEvidence } from "./verify.js";
import {
  emptyObservations,
  type Ledger,
  type LedgerHandle,
  type LedgerItem,
  type LedgerUpdate,
} from "./types.js";

const MAX_TOOL_RESULTS = 60;
const MAX_RESULT_CHARS = 20_000;
const MIN_DEVIATION_NOTE = 10;

export function createLedgerHandle(ledger: Ledger): LedgerHandle {
  const observations = emptyObservations();

  const item = (id: string) => ledger.items.find((i) => i.id === id);

  return {
    ledger,
    observations,

    recordToolResult(tool, text) {
      observations.tools.push({ tool, text: (text ?? "").slice(0, MAX_RESULT_CHARS) });
      if (observations.tools.length > MAX_TOOL_RESULTS) {
        observations.tools.splice(0, observations.tools.length - MAX_TOOL_RESULTS);
      }
    },

    recordCommand(rec) {
      observations.commands.push(rec);
      this.recordToolResult("execute_command", `${rec.stdout}\n${rec.stderr}`.slice(0, MAX_RESULT_CHARS));
    },

    noteWritten(path) {
      const norm = path.replace(/^\.\//, "");
      if (!observations.writtenFiles.includes(norm)) observations.writtenFiles.push(norm);
    },

    update(input: LedgerUpdate): { ok: true; item: LedgerItem } | { ok: false; error: string } {
      const ids = ledger.items.map((i) => i.id).join(", ");
      if (!input || typeof input.id !== "string") {
        return { ok: false, error: `id is required. Valid ids: ${ids}` };
      }
      const target = item(input.id);
      if (!target) return { ok: false, error: `Unknown ledger id "${input.id}". Valid ids: ${ids}` };

      const status = input.status;
      if (status !== "done" && status !== "deviation" && status !== "todo") {
        return { ok: false, error: `status must be done, deviation or todo (got "${status}")` };
      }

      if (status === "deviation") {
        const note = (input.note ?? target.note ?? "").trim();
        if (note.length < MIN_DEVIATION_NOTE) {
          return {
            ok: false,
            error:
              "A deviation needs a reason: say what could not work and what you did instead. " +
              "Silent substitution is not accepted.",
          };
        }
        target.status = "deviation";
        target.note = note;
        target.verdict = undefined;
        target.detail = undefined;
        return { ok: true, item: target };
      }

      if (status === "done") {
        const evidence = input.evidence ?? target.evidence;
        const checked = checkEvidence({ ...target, evidence }, observations);
        if (!checked.ok) {
          return {
            ok: false,
            error: `evidence rejected: ${checked.problem}. Run the command, then copy at least 12 characters ` +
              `of its real output into evidence.quote (and set evidence.command to the command).`,
          };
        }
        target.status = "done";
        target.evidence = evidence;
        target.verdict = undefined;
        target.detail = undefined;
        return { ok: true, item: target };
      }

      target.status = "todo";
      target.evidence = input.evidence ?? target.evidence;
      target.verdict = undefined;
      target.detail = undefined;
      return { ok: true, item: target };
    },
  };
}