import type { ProviderMessage } from "./provider.js";

export type SessionStatus = "idle" | "running" | "done" | "error" | "cancelled";

export class AgentSession {
  readonly id: string;
  status: SessionStatus = "idle";
  messages: ProviderMessage[] = [];
  private abort: AbortController | null = null;
  private approvals = new Map<string, { resolve: (ok: boolean) => void }>();

  constructor(id = `s-${Date.now()}`) {
    this.id = id;
  }

  beginTurn() {
    this.abort?.abort();
    for (const [, pending] of this.approvals) pending.resolve(false);
    this.approvals.clear();
    this.abort = new AbortController();
    this.status = "running";
    return this.abort.signal;
  }

  cancel() {
    this.abort?.abort();
    for (const [, pending] of this.approvals) pending.resolve(false);
    this.approvals.clear();
    this.status = "cancelled";
  }

  awaitApproval(toolCallId: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.approvals.set(toolCallId, { resolve });
    });
  }

  resolveApproval(toolCallId: string, approved: boolean) {
    const pending = this.approvals.get(toolCallId);
    if (!pending) return false;
    this.approvals.delete(toolCallId);
    pending.resolve(approved);
    return true;
  }

  get signal() {
    return this.abort?.signal;
  }
}
