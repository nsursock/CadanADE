#!/usr/bin/env node
/**
 * Hybrid A/B harness (API path): same frontier model, Normal vs Thrift.
 *
 * Prerequisites:
 *   - Cadan web running: pnpm dev  (http://localhost:5175)
 *   - OPENROUTER_API_KEY in env (or already saved in the running server)
 *
 * Usage:
 *   node apps/web/scripts/ab-agent.mjs
 *   # free model + simulated $ (Sonnet-like rates on tokens)
 *   CADAN_AB_MODEL=openrouter/free pnpm ab:agent
 *   CADAN_AB_MODEL=anthropic/claude-sonnet-4 node apps/web/scripts/ab-agent.mjs
 *   CADAN_AB_BASE=http://localhost:5175 CADAN_AB_TIMEOUT_MS=900000 node apps/web/scripts/ab-agent.mjs
 */
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const BASE = (process.env.CADAN_AB_BASE ?? "http://localhost:5175").replace(/\/$/, "");

/** Load repo `.env` into process.env without overriding existing vars. */
async function loadEnvFiles() {
  for (const file of [path.join(ROOT, ".env"), path.join(ROOT, "apps/web/.env")]) {
    let text = "";
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      if (process.env[key] !== undefined) continue;
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

await loadEnvFiles();

const MODEL = process.env.CADAN_AB_MODEL ?? "openrouter/free";
const WORKER = process.env.CADAN_AB_WORKER ?? "openrouter/free";
const TIMEOUT_MS = Number(process.env.CADAN_AB_TIMEOUT_MS ?? 15 * 60 * 1000);
const MODES = (process.env.CADAN_AB_MODES ?? "normal,thrift")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s === "normal" || s === "thrift");

const EXPECTED = (process.env.CADAN_AB_EXPECTED ?? "ppo.py,sac.py,td3.py,cartpole.py,pendulum.py")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MIN_PY = Number(process.env.CADAN_AB_MIN_PY ?? 0);

/** Reference rates ($ / 1M tokens) used to simulate paid cost from free-model token counts. */
const SIM_AS = process.env.CADAN_AB_SIM_AS ?? "anthropic/claude-sonnet-4";
const SIM_INPUT_PER_M = Number(process.env.CADAN_AB_SIM_INPUT_PER_M ?? 3);
const SIM_OUTPUT_PER_M = Number(process.env.CADAN_AB_SIM_OUTPUT_PER_M ?? 15);

function simulateCostUsd(promptTokens, completionTokens) {
  const input = (Number(promptTokens) || 0) * (SIM_INPUT_PER_M / 1_000_000);
  const output = (Number(completionTokens) || 0) * (SIM_OUTPUT_PER_M / 1_000_000);
  return input + output;
}

function enrichUsage(usage) {
  if (!usage) return null;
  const promptTokens = Number(usage.promptTokens ?? 0);
  const completionTokens = Number(usage.completionTokens ?? 0);
  const totalTokens = Number(usage.totalTokens ?? promptTokens + completionTokens);
  const costUsd = Number(usage.costUsd ?? 0);
  const simulatedCostUsd = simulateCostUsd(promptTokens, completionTokens);
  /** Prefer billed $ when present; otherwise use simulated (free models). */
  const compareCostUsd = costUsd > 0 ? costUsd : simulatedCostUsd;
  return {
    ...usage,
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd,
    simulatedCostUsd,
    compareCostUsd,
    simAs: SIM_AS,
    simInputPerM: SIM_INPUT_PER_M,
    simOutputPerM: SIM_OUTPUT_PER_M,
  };
}

async function api(pathname, { method = "GET", body, timeoutMs = 30_000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${pathname}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      throw new Error(`${method} ${pathname} → ${res.status}: ${text.slice(0, 400)}`);
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}

async function readPrompt() {
  const custom = process.env.CADAN_AB_PROMPT;
  if (custom) return custom;
  const p = path.join(__dirname, "fixtures/ab-prompt.txt");
  return (await readFile(p, "utf8")).trim();
}

async function configure(mode) {
  const payload = {
    model: MODEL,
    workerModel: WORKER,
    agentMode: mode,
  };
  if (process.env.OPENROUTER_API_KEY) payload.apiKey = process.env.OPENROUTER_API_KEY;
  if (process.env.OPENROUTER_BASE_URL) payload.baseUrl = process.env.OPENROUTER_BASE_URL;
  await api("/api/settings", { method: "POST", body: payload });
  const cfg = await api("/api/settings");
  if (!cfg.hasKey && !process.env.OPENROUTER_API_KEY) {
    throw new Error("No provider key. Set OPENROUTER_API_KEY or save a key in Cadan Settings.");
  }
  return cfg;
}

async function makeWorkspace() {
  const dir = path.join(os.tmpdir(), `cadan-ab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "README.md"),
    "# Cadan A/B scratch\n\nAgent should create RL algo/env files here.\n",
    "utf8",
  );
  const opened = await api("/api/workspace", { method: "POST", body: { action: "open", path: dir } });
  return { dir, root: opened.root ?? dir };
}

async function listPy(dir) {
  const names = await readdir(dir);
  return names.filter((n) => n.endsWith(".py")).sort();
}

async function scoreWorkspace(dir) {
  const files = await listPy(dir);
  if (MIN_PY > 0) {
    return {
      files,
      missing: files.length >= MIN_PY ? [] : [`need≥${MIN_PY}.py (got ${files.length})`],
      passed: files.length >= MIN_PY,
    };
  }
  const missing = EXPECTED.filter((f) => !files.includes(f));
  return {
    files,
    missing,
    passed: missing.length === 0,
  };
}

async function autoApprove(sessionId, toolCallId) {
  try {
    await api("/api/chat/approve", {
      method: "POST",
      body: { sessionId, toolCallId, approved: true },
    });
  } catch (e) {
    console.warn("  approve failed:", e instanceof Error ? e.message : e);
  }
}

async function runArm(mode, prompt, workspaceDir) {
  console.log(`\n=== Arm: ${mode} · model=${MODEL} ===`);
  await configure(mode);
  const reset = await api("/api/chat", { method: "POST", body: { action: "reset" } });
  console.log(`  local session ${reset.sessionId}`);

  // Wipe previous arm artifacts so scores don't leak across modes
  for (const f of await listPy(workspaceDir)) {
    await rm(path.join(workspaceDir, f), { force: true });
  }

  const started = Date.now();
  const events = [];
  let usage = null;
  let error = null;
  let openRouterSessionId = null;

  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: prompt }),
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    throw new Error(`chat failed ${res.status}: ${t.slice(0, 400)}`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const deadline = started + TIMEOUT_MS;

  while (true) {
    if (Date.now() > deadline) {
      error = `timeout after ${TIMEOUT_MS}ms`;
      break;
    }
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const chunks = buf.split("\n\n");
    buf = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk.trim();
      if (!line.startsWith("data:")) continue;
      let ev;
      try {
        ev = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      events.push({ type: ev.type, t: ev.timestamp, data: ev.data });
      if (ev.data?.openRouterSessionId) openRouterSessionId = String(ev.data.openRouterSessionId);
      if (ev.type === "tool.approval_required") {
        await autoApprove(ev.sessionId, String(ev.data?.toolCallId ?? ""));
      }
      if (ev.type === "done" || ev.type === "cancelled" || ev.type === "error") {
        usage = {
          promptTokens: Number(ev.data?.promptTokens ?? 0),
          completionTokens: Number(ev.data?.completionTokens ?? 0),
          totalTokens: Number(ev.data?.totalTokens ?? 0),
          costUsd: Number(ev.data?.costUsd ?? 0),
          generations: ev.data?.generations ?? [],
          agentMode: ev.data?.agentMode ?? mode,
          openRouterSessionId: ev.data?.openRouterSessionId ?? openRouterSessionId,
        };
      }
      if (ev.type === "error") error = String(ev.data?.message ?? "error");
      if (ev.type !== "text.delta" && ev.type !== "tool.args") {
        process.stdout.write(`  · ${ev.type}\n`);
      }
    }
  }

  const elapsedMs = Date.now() - started;
  const score = await scoreWorkspace(workspaceDir);
  const toolCalls = events.filter((e) => e.type === "tool.start").length;
  const enriched = enrichUsage(usage);

  const result = {
    mode,
    model: MODEL,
    workerModel: mode === "thrift" ? WORKER : null,
    elapsedMs,
    error,
    usage: enriched,
    openRouterSessionId: enriched?.openRouterSessionId ?? openRouterSessionId,
    toolCalls,
    eventCounts: events.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] ?? 0) + 1;
      return acc;
    }, {}),
    score,
    localSessionId: reset.sessionId,
  };

  const billed = enriched?.costUsd ?? 0;
  const sim = enriched?.simulatedCostUsd ?? 0;
  const compare = enriched?.compareCostUsd ?? 0;
  console.log(
    `  done · ${score.passed ? "PASS" : "FAIL"} · ${usageLabel(billed, sim, compare)} · ${enriched?.totalTokens ?? 0} tok · ${elapsedMs}ms`,
  );
  if (score.missing.length) console.log(`  missing: ${score.missing.join(", ")}`);
  if (openRouterSessionId) console.log(`  openrouter session: ${openRouterSessionId}`);
  return result;
}

function usageLabel(billed, sim, compare) {
  if (billed > 0) return `$${billed.toFixed(4)} billed (sim $${sim.toFixed(4)} as ${SIM_AS})`;
  return `$${compare.toFixed(4)} sim as ${SIM_AS} (billed $0)`;
}

function toCsv(rows) {
  const cols = [
    "mode",
    "model",
    "passed",
    "costUsd",
    "simulatedCostUsd",
    "compareCostUsd",
    "totalTokens",
    "promptTokens",
    "completionTokens",
    "toolCalls",
    "elapsedMs",
    "openRouterSessionId",
    "missing",
  ];
  const lines = [cols.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.mode,
        r.model,
        r.score.passed,
        r.usage?.costUsd ?? "",
        r.usage?.simulatedCostUsd ?? "",
        r.usage?.compareCostUsd ?? "",
        r.usage?.totalTokens ?? "",
        r.usage?.promptTokens ?? "",
        r.usage?.completionTokens ?? "",
        r.toolCalls,
        r.elapsedMs,
        JSON.stringify(r.openRouterSessionId ?? ""),
        JSON.stringify((r.score.missing ?? []).join("|")),
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

async function main() {
  console.log(`Cadan A/B · ${BASE} · model=${MODEL} · modes=${MODES.join(",")}`);
  console.log(
    `  sim pricing: ${SIM_AS} @ $${SIM_INPUT_PER_M}/M in · $${SIM_OUTPUT_PER_M}/M out (used when billed $ is 0)`,
  );
  try {
    await api("/api/settings", { timeoutMs: 5_000 });
  } catch (e) {
    throw new Error(
      `Cannot reach Cadan at ${BASE}. Start with \`pnpm dev\` first.\n${e instanceof Error ? e.message : e}`,
    );
  }

  const prompt = await readPrompt();
  const { dir, root } = await makeWorkspace();
  console.log(`workspace: ${root}`);

  const arms = [];
  for (const mode of MODES) {
    arms.push(await runArm(mode, prompt, dir));
  }

  const outDir = path.join(ROOT, "ab-results");
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(outDir, `ab-${stamp}.json`);
  const csvPath = path.join(outDir, `ab-${stamp}.csv`);
  const report = {
    at: new Date().toISOString(),
    base: BASE,
    model: MODEL,
    worker: WORKER,
    workspace: root,
    promptChars: prompt.length,
    simulation: {
      as: SIM_AS,
      inputPerM: SIM_INPUT_PER_M,
      outputPerM: SIM_OUTPUT_PER_M,
    },
    arms,
  };
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await writeFile(csvPath, toCsv(arms), "utf8");

  console.log(`\nWrote ${jsonPath}`);
  console.log(`Wrote ${csvPath}`);

  if (arms.length === 2) {
    const [a, b] = arms;
    const ca = a.usage?.compareCostUsd ?? 0;
    const cb = b.usage?.compareCostUsd ?? 0;
    const ta = a.usage?.totalTokens ?? 0;
    const tb = b.usage?.totalTokens ?? 0;
    console.log(
      `\nCompare (compareCost): ${a.mode}=$${ca.toFixed(4)} / ${ta} tok (${a.score.passed ? "pass" : "fail"}) vs ${b.mode}=$${cb.toFixed(4)} / ${tb} tok (${b.score.passed ? "pass" : "fail"})`,
    );
    if ((a.usage?.costUsd ?? 0) === 0 && (b.usage?.costUsd ?? 0) === 0) {
      console.log(`  (billed $0 on both — compareCost is simulated as ${SIM_AS})`);
    }
  }

  const anyFail = arms.some((a) => !a.score.passed || a.error);
  process.exitCode = anyFail ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
