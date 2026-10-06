/** Small text helpers shared by the ledger checks. */

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Collapse whitespace so a pasted quote can be matched against wrapped output. */
export function normalizeOutput(text: string): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

const NON_CODE_EXT = /\.(?:md|mdx|rst|txt|csv|log|lock|map|png|jpe?g|gif|webp|svg|ico|woff2?|ttf)$/i;

export function isCodePath(path: string): boolean {
  return !NON_CODE_EXT.test(path);
}

/**
 * Stricter than a substring match: `npm run size2` must not satisfy evidence
 * claimed from `npm run size`. The extra text has to start a new shell word.
 */
export function matchesEvidenceCommand(executed: string, claimed: string): boolean {
  const a = normalizeOutput(executed);
  const b = normalizeOutput(claimed);
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (!longer.includes(shorter)) return false;
  const rest = longer.slice(shorter.length);
  return rest === "" || /^[\s|;&(]/.test(rest);
}