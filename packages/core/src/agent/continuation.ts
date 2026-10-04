/**
 * "Stopped, but not finished" detection and the nudges that unstick a turn.
 *
 * Small free models end turns in three unhelpful ways: replying with prose
 * instead of calling a tool, repeating one identical tool call, or looping in
 * reasoning until generation is cut. All three used to end the turn, which meant
 * the user had to keep typing "continue". Each is now recoverable for a bounded
 * number of retries before the turn is allowed to end.
 */

/** Trailing punctuation / fence that suggests the reply actually finished. */
const SETTLED_TAIL = /[.!?)`'"]\s*$/;

/** Explicit completion claims — the model considers the task closed. */
const SETTLED_CLAIM =
  /\b(all (?:done|set|tests? pass|green)|that'?s (?:all|it|everything)|(?:task|work|it) (?:is )?(?:done|complete|finished)|in summary|summary of|what i (?:changed|did)|to summarize|final (?:summary|state)|no (?:further|more) changes)\b/i;

/** Forward-looking intent that promises a tool call the model never made. */
const PENDING_INTENT =
  /\b(?:now|next|then|first)\s+(?:i'?ll|i will|let me|we'?ll|we will)\b|\blet me (?:now |continue |proceed |create |add |write |update |fix |run |check |open |read |edit |implement |build |start |move |switch )|\bi'?ll (?:now |continue |proceed |create |add |write |update |fix |run |check |open |read |edit |implement |build )|\b(?:next step|remaining (?:steps?|work|files?|tasks?)|still (?:need|need to|have to|remaining)|to finish (?:this|the)|continuing (?:with|now))\b/i;

export const UNFINISHED_TURN_NUDGE =
  "You stopped without calling a tool, so the task is not done. Do not reply with prose — call the next tool now and keep going. Only send a text reply once the work is actually finished.";

export const REPEAT_TOOL_NUDGE =
  "You just ran that exact tool call with identical arguments and got the same result back. Repeating it changes nothing — change the arguments, use a different tool, or move on to the next step of the task.";

export const REASONING_LOOP_NUDGE =
  "Your reasoning repeated itself and generation was stopped. Stop deliberating: take the next concrete action with what you already know, or report the result if the task is genuinely complete.";

export const MAX_UNFINISHED_NUDGES = 3;
export const MAX_REPEAT_NUDGES = 2;
export const MAX_REASONING_NUDGES = 2;

/**
 * True when a tool-less reply looks like the model stalled rather than finished.
 * Conservative by design: a settled completion claim always wins, and forward
 * intent only counts once the agent has actually been doing work (`iterations > 0`)
 * so ordinary short answers to "what does this do?" stay short.
 */
export function looksUnfinished(text: string, opts?: { iterations?: number }): boolean {
  const body = (text ?? "").trim();
  if (!body) return true; // reasoning-only or a stopped stream produced nothing
  if (SETTLED_CLAIM.test(body)) return false;
  if (!SETTLED_TAIL.test(body)) return true; // cut off mid-sentence (usually max_tokens)
  const iterations = opts?.iterations ?? 0;
  return iterations > 0 && PENDING_INTENT.test(body);
}