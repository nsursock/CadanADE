/**
 * Ledger persistence and spec discovery.
 *
 * The checklist lives at `.cadan/REQUIREMENTS.md` — inside the workspace so it
 * is a real, reviewable file, but in the directory the file tree already hides
 * so it doesn't clutter someone's project. Statuses survive the next turn, so a
 * long task resumes with its ledger intact instead of starting from blank.
 */

import { parseLedgerFile } from "./render.js";
import type { Ledger } from "./types.js";
import type { WorkspaceService } from "../../services/workspace-service.js";

export const LEDGER_PATH = ".cadan/REQUIREMENTS.md";

const SPEC_EXT = /\.(?:md|mdx|txt|rst)$/i;
const MAX_SPEC_BYTES = 200_000;

/** `@SPEC.md`, or a bare doc path mentioned in the request. */
export function findSpecReference(text: string): string | null {
  const mention = /@([\w./-]+\.(?:md|mdx|txt|rst))\b/.exec(text);
  if (mention) return mention[1].replace(/^\.\//, "");
  const bare = /(?:^|\s)((?:[\w.-]+\/)*[\w.-]+\.(?:md|mdx|txt|rst))(?=\s|$|[.,;:])/g;
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = bare.exec(text))) last = m[1];
  return last;
}

export async function loadSpec(
  workspace: WorkspaceService,
  root: string,
  userText: string,
): Promise<{ text: string; path: string } | null> {
  const ref = findSpecReference(userText);
  if (!ref) return null;
  if (!SPEC_EXT.test(ref)) return null;
  try {
    const file = await workspace.readFile(root, ref);
    if (file.content.length > MAX_SPEC_BYTES) return null;
    return { text: file.content, path: ref };
  } catch {
    return null;
  }
}

export async function readLedgerFile(workspace: WorkspaceService, root: string): Promise<string | null> {
  try {
    return (await workspace.readFile(root, LEDGER_PATH)).content;
  } catch {
    return null;
  }
}

export async function writeLedgerFile(
  workspace: WorkspaceService,
  root: string,
  content: string,
): Promise<void> {
  try {
    const current = await workspace.readFile(root, LEDGER_PATH);
    await workspace.writeFile(root, LEDGER_PATH, content, current.hash);
  } catch {
    await workspace.writeFile(root, LEDGER_PATH, content).catch(() => {});
  }
}

/** Re-apply the previous run's statuses when the spec is recognisably the same. */
export function hydrate(ledger: Ledger, previous: string | null): Ledger {
  if (!previous || !ledger.items.length) return ledger;
  // A different spec, or a reshuffled ledger — statuses would attach to the wrong lines.
  if (ledger.specPath && !previous.includes(ledger.specPath)) return ledger;
  const states = parseLedgerFile(previous);
  if (!states.size) return ledger;
  if (states.get(ledger.items[0].id)?.text !== ledger.items[0].text) return ledger;
  for (const item of ledger.items) {
    const state = states.get(item.id);
    if (!state || state.text !== item.text) continue;
    item.status = state.status;
    if (state.note) item.note = state.note;
  }
  return ledger;
}