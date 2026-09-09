export type OutlineBullet = { line: number; kind: string; text: string };

const HEADING = /^(#{1,6})\s+(.+)$/;
const EXPORT =
  /^(export\s+)?(async\s+)?(function|class|const|let|var|type|interface|enum)\s+([A-Za-z0-9_$]+)/;
const DEF = /^(def|class|async\s+def)\s+([A-Za-z0-9_]+)/;
const RUST_FN = /^(pub\s+)?(async\s+)?fn\s+([A-Za-z0-9_]+)/;
const GO_FN = /^func\s+(\([^)]+\)\s+)?([A-Za-z0-9_]+)/;

/** Deterministic structure bullets — no model, no storage. */
export function buildFileOutline(content: string, max = 80): OutlineBullet[] {
  const lines = content.split("\n");
  const out: OutlineBullet[] = [];
  const seen = new Set<string>();

  const push = (line: number, kind: string, text: string) => {
    const key = `${kind}:${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ line, kind, text: text.slice(0, 120) });
  };

  for (let i = 0; i < lines.length && out.length < max; i++) {
    const raw = lines[i] ?? "";
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

    const h = HEADING.exec(trimmed);
    if (h) {
      push(i + 1, "heading", h[2]!.trim());
      continue;
    }
    const ex = EXPORT.exec(trimmed);
    if (ex) {
      push(i + 1, ex[3]!, ex[4]!);
      continue;
    }
    const py = DEF.exec(trimmed);
    if (py) {
      push(i + 1, py[1]!.includes("class") ? "class" : "function", py[2]!);
      continue;
    }
    const rs = RUST_FN.exec(trimmed);
    if (rs) {
      push(i + 1, "fn", rs[3]!);
      continue;
    }
    const go = GO_FN.exec(trimmed);
    if (go) {
      push(i + 1, "func", go[2]!);
      continue;
    }
  }

  if (out.length < 8) {
    const step = Math.max(40, Math.floor(lines.length / 12));
    for (let i = 0; i < lines.length && out.length < max; i += step) {
      const sample = (lines[i] ?? "").trim().slice(0, 80);
      if (sample) push(i + 1, "slice", sample);
    }
  }

  return out;
}

export function formatOutlineBullets(bullets: OutlineBullet[]): string {
  return bullets.map((b) => `- L${b.line} [${b.kind}] ${b.text}`).join("\n");
}
