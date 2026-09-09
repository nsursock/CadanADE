# Cadan hybrid A/B harness

Two layers:

1. **API A/B** (`scripts/ab-agent.mjs`) — fair Normal vs Thrift with the **same frontier model**, OpenRouter `session_id` tags, token rollup + simulated $, file-existence score.
2. **Playwright smoke** (`e2e/smoke.spec.ts`) — UI sanity only (landing + settings routing toggle).

## Prerequisites

```bash
pnpm install
pnpm --filter @cadan/web exec playwright install chromium   # once
pnpm dev   # http://localhost:5175
```

Set `OPENROUTER_API_KEY` in repo-root `.env` (or save a key in Cadan Settings).

## Free-model A/B (recommended while iterating)

Free models bill **$0**, but the harness still counts tokens and **simulates** what that run would cost on a paid reference model (default: Claude Sonnet–like rates).

```bash
# DFT/FFT smoke — free router, compare Normal vs Thrift on tokens / sim $
CADAN_AB_MODEL=openrouter/free \
CADAN_AB_PROMPT='Write a DFT and FFT comparison in python. Validate correctness against known implementations' \
CADAN_AB_MIN_PY=1 \
pnpm ab:agent
```

Simulated cost formula:

`sim$ = promptTokens × ($input / 1M) + completionTokens × ($output / 1M)`

Defaults: `$3 / 1M` input, `$15 / 1M` output (Sonnet-class). Override with `CADAN_AB_SIM_*` below.

## Paid-model A/B

```bash
CADAN_AB_MODEL=anthropic/claude-sonnet-4 pnpm ab:agent
```

When OpenRouter returns a real `costUsd`, the harness still records `simulatedCostUsd`, but **compareCostUsd** prefers the billed amount.

## Env knobs

| Var | Default | Meaning |
|---|---|---|
| `CADAN_AB_BASE` | `http://localhost:5175` | Cadan origin |
| `CADAN_AB_MODEL` | `openrouter/free` | Frontier model (both arms) |
| `CADAN_AB_WORKER` | `openrouter/free` | Thrift worker model |
| `CADAN_AB_MODES` | `normal,thrift` | Arms to run |
| `CADAN_AB_TIMEOUT_MS` | `900000` | Per-arm timeout |
| `CADAN_AB_PROMPT` | fixture file | Override prompt text |
| `CADAN_AB_MIN_PY` | `0` | Pass if ≥ N `.py` files (ignores name list) |
| `CADAN_AB_EXPECTED` | `ppo.py,…` | Exact filenames required when `MIN_PY=0` |
| `CADAN_AB_SIM_AS` | `anthropic/claude-sonnet-4` | Label for simulated pricing |
| `CADAN_AB_SIM_INPUT_PER_M` | `3` | Simulated $ per 1M prompt tokens |
| `CADAN_AB_SIM_OUTPUT_PER_M` | `15` | Simulated $ per 1M completion tokens |
| `OPENROUTER_API_KEY` | — | Pushed into server settings |

Results land in `ab-results/ab-<timestamp>.{json,csv}` with `costUsd`, `simulatedCostUsd`, and `compareCostUsd`.

## Run UI smoke

```bash
pnpm smoke:ui
```

Does **not** burn tokens; does not run the agent.
