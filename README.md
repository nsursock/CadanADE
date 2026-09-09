# CadanADE

**Coding All Day and All Night** — a local, agent-first coding IDE.

CadanADE is a SvelteKit workspace IDE with file tree, CodeMirror editing, OpenRouter agent chat, themes, and an optional Electron desktop shell. It is the first consumer and living demo of [`@scifiui/core`](https://github.com/nsursock/ScifiUI) (sibling package).

## Features

- Open a local folder as a workspace (recent + discovered projects)
- File tree, tabs, and CodeMirror 6 editing with save
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
