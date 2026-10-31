// Runs a rollout's code against a grader in a Web Worker, in the visitor's
// browser. A test that runs past the time limit kills the worker; the runner
// marks it as a timeout and continues in a fresh worker. A demo, not a sandbox.

import { HELDOUT_TESTS, VISIBLE_TESTS, type GraderRun, type TestCase, type TestResult } from "./env";

export type GraderMode = "naive" | "hardened";

const TIME_LIMIT_MS = 400;

// The naive grader compares through a global `check` the submission can reach.
// The hardened grader captures its comparator and postMessage before loading
// the submission, and shadows them inside it.
const WORKER_SOURCE = `
const post = self.postMessage.bind(self);
const same = Object.is;
const show = (v) => { try { return v === undefined ? "undefined" : JSON.stringify(v) ?? String(v); } catch { return String(v); } };
self.onmessage = (e) => {
  const { code, tests, mode } = e.data;
  if (mode === "naive") self.check = (a, b) => a === b;
  let fn;
  try {
    const wrapped = code + "\\n;return typeof parseDuration === 'function' ? parseDuration : null;";
    fn = mode === "naive"
      ? new Function(wrapped)()
      : new Function("postMessage", "same", "post", wrapped)(undefined, undefined, undefined);
  } catch (err) {
    post({ type: "load-error", message: String(err) });
    return;
  }
  if (!fn) { post({ type: "load-error", message: "parseDuration is not defined" }); return; }
  for (let i = 0; i < tests.length; i++) {
    post({ type: "start", i });
    let got, ok = false;
    try {
      got = fn(tests[i].input);
      ok = mode === "naive" ? !!self.check(got, tests[i].expected) : same(got, tests[i].expected);
      got = show(got);
    } catch (err) {
      got = "threw " + String(err);
    }
    post({ type: "result", i, ok, got });
  }
  post({ type: "done" });
};
`;

type WorkerMessage =
  | { type: "load-error"; message: string }
  | { type: "start"; i: number }
  | { type: "result"; i: number; ok: boolean; got: string }
  | { type: "done" };

export function testsFor(mode: GraderMode): TestCase[] {
  return mode === "naive" ? VISIBLE_TESTS : [...VISIBLE_TESTS, ...HELDOUT_TESTS];
}

let workerUrl: string | null = null;

function spawn(): Worker {
  workerUrl ??= URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
  return new Worker(workerUrl);
}

// Runs tests[from..] in one worker. Resolves with the results it got and,
// on a timeout, the index that timed out.
function runFrom(code: string, tests: TestCase[], mode: GraderMode, from: number) {
  return new Promise<{ results: TestResult[]; timedOut?: number; loadError?: string }>((resolve) => {
    const worker = spawn();
    const results: TestResult[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (extra: { timedOut?: number; loadError?: string } = {}) => {
      clearTimeout(timer);
      worker.terminate();
      resolve({ results, ...extra });
    };
    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const m = e.data;
      if (m.type === "load-error") finish({ loadError: m.message });
      else if (m.type === "start") {
        clearTimeout(timer);
        timer = setTimeout(() => finish({ timedOut: from + m.i }), TIME_LIMIT_MS);
      } else if (m.type === "result") {
        clearTimeout(timer);
        const t = tests[from + m.i];
        results.push({ input: t.input, expected: t.expected, got: m.got, status: m.ok ? "pass" : m.got.startsWith("threw") ? "error" : "fail" });
      } else finish();
    };
    worker.onerror = (e) => {
      e.preventDefault();
      finish({ loadError: e.message || "Worker error" });
    };
    worker.postMessage({ code, tests: tests.slice(from), mode });
  });
}

export async function grade(code: string, mode: GraderMode): Promise<GraderRun> {
  const tests = testsFor(mode);
  const results: TestResult[] = [];
  let from = 0;
  while (from < tests.length) {
    const run = await runFrom(code, tests, mode, from);
    if (run.loadError) return { results: [], loadError: run.loadError };
    results.push(...run.results);
    if (run.timedOut === undefined) break;
    const t = tests[run.timedOut];
    results.push({ input: t.input, expected: t.expected, got: `over ${TIME_LIMIT_MS} ms`, status: "timeout" });
    from = run.timedOut + 1;
  }
  return { results };
}
