# CadanADE

**Coding All Day and All Night** — a local, agent-first coding IDE.

CadanADE is a SvelteKit workspace IDE with file tree, CodeMirror editing, OpenRouter agent chat, themes, and an optional Electron desktop shell. It is the first consumer and living demo of [`@scifiui/core`](https://github.com/nsursock/ScifiUI) (sibling package).

## Features

- Open a local folder as a workspace (recent + discovered projects)
- File tree, tabs, and CodeMirror 6 editing with save and minimap
- Agent edit review: green/red highlights with Accept / Reject (per file + Accept all / Reject all in chat)
- Local history: shadow git under `.cadan/history.git` on save and Accept (does not touch the project `.git`)

- Streaming agent chat (OpenRouter) with tool calls and approval gates
- Settings console: provider key, themes, performance lite mode
- Optional Electron app wrapping the same SvelteKit server

## Stack

| Layer | Tech |
| --- | --- |
| UI | Svelte 5, SvelteKit, Tailwind v4, ScifiUI, Tabler icons |
| Motion / 3D | GSAP, Three.js (optional particle field) |
| Editor | CodeMirror 6 |
| Core | `@cadan/core` (agent, workspace, settings) |
| Desktop | Electron 33 + adapter-node |

## Monorepo

```text
apps/web/        @cadan/web — SvelteKit UI (http://localhost:5175)
apps/desktop/    @cadan/desktop — Electron wrapper
packages/core/   @cadan/core — shared services & agent runtime
```

ScifiUI is linked from a sibling checkout via pnpm workspace:

```text
parent/
  ScifiUI/
  CadanADE/
```

## Requirements

- Node.js **20+** (**.nvmrc** pins **22**)
- **pnpm** 9.15+
- Sibling **ScifiUI** repo for `@scifiui/core`

## Quick start

```bash
pnpm install
pnpm dev
```

Open [http://localhost:5175](http://localhost:5175).

Desktop (web + Electron):

```bash
pnpm desktop:dev
```

If Electron’s binary failed to install:

```bash
pnpm --filter @cadan/desktop run electron:repair
```

## Agent setup

1. Open **Settings** (gear in the app bar).
2. Save an OpenRouter API key (and optional base URL / model).
3. Defaults to `openrouter/free`; the model picker unlocks after a key is saved.

Env fallbacks: `OPENROUTER_API_KEY`, `CADAN_MODEL` (see `apps/web/.env.example`).

## Agent self-verification

The agent cannot mark its own work done. When a request carries a spec — either
inline or as a referenced file such as `@SPEC.md` — Cadan derives a
**requirements ledger** from it before starting work: one line per MUST, STRICT,
"do not", numeric limit, named library, banned dependency and named deliverable.
The ledger is written to `.cadan/REQUIREMENTS.md` and re-injected at the start of
every turn.

Each line ends in a verdict the **harness** writes, never the model:

| Verdict | Meaning |
| --- | --- |
| PASS | The harness check ran and agreed |
| FAIL | The check ran and disagreed (the note says where and what it found) |
| DEVIATION | Recorded by the agent with a stated reason — nothing is substituted silently |
| UNVERIFIED | No measured evidence attached yet |

Generic checks, none of which need project knowledge:

- named libraries are **imported and called**, not just mentioned or listed
- banned dependencies are absent from code **and** dependency files
- named deliverables exist and are non-empty
- numeric limits are compared against the numbers in the attached output
- evidence quotes must appear in real tool output from the turn — invented ones
  are rejected when the agent tries to record them
- files the agent touched are scanned for stubs: TODO / "would" / "in practice" /
  placeholder markers, functions that only return a constant, unused imports
- command output is screened for plausibility: identical output across repeated
  runs, duplicated rows, constant columns, values outside a declared range
- narrowed runs (`-k`, `--limit`, `--sample`, …) are labelled in the report

A text reply is treated as a claim, not evidence. While lines are unverified the
completion gate refuses the claim and hands the agent the failing lines (up to 4
retries); the turn then ends with an explicit FAIL report. The report is
generated from the ledger and shown under the chat, so a bare ✅ is never the
whole story.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Web app on port 5175 |
| `pnpm desktop:dev` | Vite + Electron |
| `pnpm desktop:build` | Package desktop app |
| `pnpm build` | Build all packages |
| `pnpm check` | Typecheck all packages |

## Soft conventions

- Prefer files **≤ ~300 lines**; split before panels grow
- Promote reusable chrome to ScifiUI; keep Cadan-only widgets here
- **Tabler icons only** — no emoji chrome
- AdaanIDE is a behavioral reference only — do not copy large files

See [`AGENTS.md`](./AGENTS.md) for agent-oriented project rules.

## License

Private / unpublished unless otherwise stated.
