# AGENTS.md

Operating manual for coding agents working in **CadanADE** (“Coding All Day and All Night”).

Inspired by patterns common in large-repo `AGENTS.md` files ([Coldtea field study](https://www.coldtea.ai/blog/agents-md-field-study)): orientation, verification, workflow, and explicit don’t-rules.

## Project overview

CadanADE is a local coding IDE: SvelteKit web UI + agent runtime + optional Electron shell. ScifiUI (sibling repo) is the CSS class kit; Cadan is its first client. AdaanIDE is a behavioral reference only — do not copy large Adaan panels wholesale.

Stack: **Svelte 5 + SvelteKit + Tailwind v4 + GSAP + Three.js + CodeMirror 6**. Architecture: **MVC-ish**, prefer small files (~300 lines soft target). Icons: **Tabler only** (no emoji chrome).

## Project structure

```
apps/web/           @cadan/web — SvelteKit UI (Vite :5175), adapter-node
apps/desktop/       @cadan/desktop — Electron wrapper (loads web / packs server)
packages/core/      @cadan/core — settings, agent, workspace services
                    client: @cadan/core | server-only: @cadan/core/server
../ScifiUI/         sibling workspace package @scifiui/core (pnpm workspace)
```

Key web paths:

- `apps/web/src/lib/views/` — UI chrome, settings, chat, tree, tooltips
- `apps/web/src/lib/server/` — provider config, agent runtime
- `apps/web/src/routes/api/` — workspace, files, chat, settings, models
- `packages/core/src/agent/` — engine, session, OpenRouter provider, tools
- Motion: GSAP via `@scifiui/core/js` (`enterShell`, `playLandingIntro`, …) — do not add a second GSAP helper layer

## Setup & build

Node **20+** (prefer **22** via `.nvmrc` / nvm). Package manager: **pnpm@9.15.0**.

```bash
pnpm install
pnpm dev                 # web only → http://localhost:5175
pnpm desktop:dev         # Vite + Electron
pnpm build               # recursive build
pnpm check               # typecheck across packages
pnpm --filter @cadan/web check
pnpm --filter @cadan/desktop typecheck
pnpm --filter @cadan/desktop run electron:repair   # if Electron binary missing
```

Never pass shell comments like `# :5175` as Vite args — they become paths.

## Testing & validation

There is no full unit-test suite yet. Before finishing a change:

```bash
pnpm --filter @cadan/web check
# If you touched core:
pnpm --filter @cadan/core check
# If you touched desktop:
pnpm --filter @cadan/desktop typecheck
```

- Run the check closest to your change while iterating; run `pnpm check` before claiming done.
- Never delete, weaken, or skip checks to make a change “pass”.
- Do not claim that an interrupted or timed-out command succeeded.
- If a command fails, report the failure. Do not guess or present assumptions as confirmed.

## Code style

- Match neighboring files: Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`), TypeScript, Tailwind utilities + ScifiUI classes.
- Prefer editing existing modules over new abstractions. No drive-by refactors or unrelated files.
- Do not add comments that restate the code. Do not reformat code you are not changing.
- Do not add dependencies without asking.
- Keep `@cadan/core` client-safe: Node-only APIs belong in `@cadan/core/server` (never pull `node:crypto` into the browser barrel).
- UI: Tabler icons only; use `$lib/views/Tooltip.svelte` for icon-button tips (viewport-aware). Prefer ScifiUI classes over one-off chrome.
- Default model id is `openrouter/free`. Provider key unlocks the model picker.

## ScifiUI boundary

- ScifiUI lives at `../ScifiUI` and is linked via pnpm workspace (`workspace:*`), not `file:`.
- Prefer consuming / extending ScifiUI CSS for reusable primitives; Cadan-specific UX stays in Cadan.
- Do not treat ScifiUI as throwaway — changes there affect other consumers. Ask before large ScifiUI edits.

## Desktop / Electron

- Dev: Electron loads `http://localhost:5175`. Prod: main process spawns adapter-node from `extraResources/server`.
- Build Node ≠ Electron’s embedded Node. Changing host `node -v` does not change runtime Node inside Electron.
- If Electron fails to install (`path.txt` / binary missing): `pnpm --filter @cadan/desktop run electron:repair`.
- Preload exposes `window.cadan` only (dialogs / menu). Keep `contextIsolation: true`, no `nodeIntegration` in renderer.

## Git workflow

- Never commit, push, or open a PR unless the user asks.
- Never update git config; never force-push `main`/`master`; avoid `--amend` unless the user’s rules explicitly allow it.
- Do not commit secrets, `.env`, API keys, or credentials.
- Prefer concise commits that explain **why**, not a file laundry list (when asked to commit).

## Boundaries

**Must / always**

- Use a todo list for multi-step work; mark items in progress/completed as you go.
- Keep diffs scoped to the request.
- Prefer absolute paths in tool calls when operating on this repo.
- Cite code with the project’s required citation format when showing existing code.

**Never**

- Do not modify unrelated files or widen scope beyond the request.
- Do not copy large AdaanIDE UI monoliths into Cadan.
- Do not introduce emoji as UI chrome; use Tabler.
- Do not put Node built-ins into client-bundled `@cadan/core` exports.
- Do not add “Generated with …” / co-author footers to commits unless the user asks.
- Do not invent CI/test results. Report what actually ran.
- Do not edit plan files the user did not ask to change.

## Security

- OpenRouter / provider keys may live in local settings and server memory for the process — never log full keys, never commit them.
- Workspace tools can read/write/execute under the opened root; treat destructive tools (delete, shell) as approval-gated.

## References

- Root `README.md` — human-oriented project notes
- [Coldtea: What the 100 biggest GitHub repos put in AGENTS.md](https://www.coldtea.ai/blog/agents-md-field-study) — structure inspiration for this file
