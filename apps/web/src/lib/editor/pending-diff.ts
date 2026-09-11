import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  gutter,
  GutterMarker,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

export type LineDiffKind = "add" | "del" | "same";

/** Classic LCS line diff → per-line ops for the new document (+ deletes as markers on neighbors). */
export function lineDiff(baseline: string, current: string): { kind: LineDiffKind; line: number }[] {
  const a = baseline.split("\n");
  const b = current.split("\n");
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const ops: { kind: LineDiffKind; line: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: "same", line: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ kind: "del", line: j + 1 });
      i++;
    } else {
      ops.push({ kind: "add", line: j + 1 });
      j++;
    }
  }
  while (i < n) {
    ops.push({ kind: "del", line: Math.min(j + 1, m || 1) });
    i++;
  }
  while (j < m) {
    ops.push({ kind: "add", line: j + 1 });
    j++;
  }
  return ops;
}

export function addedLineSet(baseline: string, current: string): Set<number> {
  const set = new Set<number>();
  for (const op of lineDiff(baseline, current)) {
    if (op.kind === "add") set.add(op.line);
  }
  return set;
}

export function deletedLineHints(baseline: string, current: string): Set<number> {
  const set = new Set<number>();
  for (const op of lineDiff(baseline, current)) {
    if (op.kind === "del") set.add(op.line);
  }
  return set;
}

const addMark = Decoration.line({ class: "cm-change-add" });
const addGutterMark = new (class extends GutterMarker {
  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-change-add-marker";
    el.title = "Added / changed";
    return el;
  }
})();
const delGutterMark = new (class extends GutterMarker {
  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-change-del-marker";
    el.title = "Removed vs saved";
    return el;
  }
})();

type DiffCache = { baseline: string; current: string; added: Set<number>; dels: Set<number> };
let diffCache: DiffCache | null = null;

function diffSets(baseline: string, current: string): DiffCache {
  if (diffCache && diffCache.baseline === baseline && diffCache.current === current) return diffCache;
  diffCache = {
    baseline,
    current,
    added: addedLineSet(baseline, current),
    dels: deletedLineHints(baseline, current),
  };
  return diffCache;
}

/** Highlight doc lines that differ from a baseline (last saved or agent pre-edit). */
export function pendingDiffExtension(getBaseline: () => string | null): Extension {
  const lineDeco = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none;

      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }

      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view);
      }

      build(view: EditorView): DecorationSet {
        const baseline = getBaseline();
        if (baseline == null) return Decoration.none;
        const current = view.state.doc.toString();
        if (current === baseline) return Decoration.none;
        const { added } = diffSets(baseline, current);
        const builder = new RangeSetBuilder<Decoration>();
        for (let i = 1; i <= view.state.doc.lines; i++) {
          if (!added.has(i)) continue;
          const line = view.state.doc.line(i);
          builder.add(line.from, line.from, addMark);
        }
        return builder.finish();
      }
    },
    { decorations: (v) => v.decorations },
  );

  const changeGutter = gutter({
    class: "cm-change-gutter",
    lineMarker(view, line) {
      const baseline = getBaseline();
      if (baseline == null) return null;
      const current = view.state.doc.toString();
      if (current === baseline) return null;
      const { added, dels } = diffSets(baseline, current);
      const lineNo = view.state.doc.lineAt(line.from).number;
      if (added.has(lineNo)) return addGutterMark;
      if (dels.has(lineNo)) return delGutterMark;
      return null;
    },
  });

  return [lineDeco, changeGutter];
}

/** Minimap gutter colors for changed lines (1-based). */
export function minimapGutterColors(baseline: string | null, current: string): Record<number, string> {
  if (baseline == null || baseline === current) return {};
  const { added, dels } = diffSets(baseline, current);
  const colors: Record<number, string> = {};
  for (const line of added) colors[line] = "rgba(34, 197, 94, 0.85)";
  for (const line of dels) colors[line] = "rgba(239, 68, 68, 0.75)";
  return colors;
}
