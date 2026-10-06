/**
 * One read of the workspace per gate run, shared by every ledger check.
 *
 * `WorkspaceService.search` re-lists and re-reads every file per call, so a
 * ledger with a dozen library lines would walk the repo a dozen times. This
 * reads each code file once and answers pattern queries from memory.
 */

import { isCodePath } from "./text.js";
import type { WorkspaceService } from "../../services/workspace-service.js";

export interface CodeHit {
  path: string;
  line: number;
  text: string;
}

const MAX_FILES = 1500;
const MAX_BYTES = 8_000_000;
const MAX_HITS = 200;

export class CodeIndex {
  private files = new Map<string, string[]>();
  private deps = "";
  private loaded: Promise<void> | null = null;

  constructor(
    private ws: WorkspaceService,
    private root: string,
    private opts: { exclude?: string[]; manifests?: string[] } = {},
  ) {}

  private async load(): Promise<void> {
    this.loaded ??= (async () => {
      const exclude = new Set(this.opts.exclude ?? []);
      let bytes = 0;
      const list = await this.ws.listFlat(this.root, "").catch(() => [] as string[]);
      for (const path of list) {
        if (path.endsWith("/") || exclude.has(path) || !isCodePath(path)) continue;
        if (this.files.size >= MAX_FILES || bytes >= MAX_BYTES) break;
        try {
          const content = (await this.ws.readFile(this.root, path)).content;
          bytes += content.length;
          this.files.set(path, content.split("\n"));
        } catch {
          /* unreadable — skip */
        }
      }
      const parts: string[] = [];
      for (const name of this.opts.manifests ?? []) {
        try {
          parts.push((await this.ws.readFile(this.root, name)).content);
        } catch {
          /* absent */
        }
      }
      this.deps = parts.join("\n");
    })();
    return this.loaded;
  }

  /** Every line matching `re`, capped so a broad pattern can't flood. */
  async find(re: RegExp): Promise<CodeHit[]> {
    await this.load();
    const flags = re.flags.replace("g", "");
    const hits: CodeHit[] = [];
    for (const [path, lines] of this.files) {
      const rx = new RegExp(re.source, flags);
      for (let i = 0; i < lines.length; i++) {
        const text = lines[i] ?? "";
        if (text.length > 2000 || !rx.test(text)) continue;
        hits.push({ path, line: i + 1, text: text.slice(0, 200) });
        if (hits.length >= MAX_HITS) return hits;
      }
    }
    return hits;
  }

  /** Dependency manifests (package.json, pyproject.toml, …) concatenated. */
  async dependencyText(): Promise<string> {
    await this.load();
    return this.deps;
  }
}