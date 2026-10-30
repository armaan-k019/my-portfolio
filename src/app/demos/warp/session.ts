// Parses a pasted agent session into steps and runs fixed rules over it.
// Shared by the page (instant flags on load) and the review route (context
// for Claude). No model call here.

export type StepKind = "agent" | "command" | "diff";
export type Severity = "high" | "medium" | "low";

export interface Step {
  index: number; // 1-based, as shown on the page
  kind: StepKind;
  head: string; // agent message, command, or diff file path
  body: string[]; // command output or diff lines
}

export interface Flag {
  step: number;
  rule: string;
  label: string;
  severity: Severity;
}

// What the review route returns from Claude, after validation.
export interface Review {
  summary: string;
  notes: { step: number; note: string }[];
  checklist: string[];
}

export const MAX_SESSION_CHARS = 12000;
export const MAX_STEPS = 60;

const DIFF_START = /^diff --git a\/(\S+)/;
// "$ " is the documented prefix. "❯ " and "% " cover common zsh and
// starship prompts so a pasted session does not need rewriting.
const COMMAND_START = /^(\$|❯|%) (.+)/;
const AGENT_START = /^agent:/i;

export function parseSession(text: string, limit = MAX_STEPS): Step[] {
  const steps: Step[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const diff = DIFF_START.exec(line);
    const command = COMMAND_START.exec(line);
    if (AGENT_START.test(line)) {
      steps.push({ index: 0, kind: "agent", head: line.slice(6).trim(), body: [] });
    } else if (command) {
      steps.push({ index: 0, kind: "command", head: command[2].trim(), body: [] });
    } else if (diff) {
      steps.push({ index: 0, kind: "diff", head: diff[1], body: [] });
    } else if (steps.length > 0 && line.length > 0) {
      steps[steps.length - 1].body.push(line);
    }
  }
  return steps.slice(0, limit).map((s, i) => ({ ...s, index: i + 1 }));
}

function addedLines(step: Step): string[] {
  return step.body.filter((l) => l.startsWith("+") && !l.startsWith("+++"));
}

// A test runner invocation, not any command that mentions a test file.
const TEST_COMMAND =
  /^(npm|pnpm|yarn|bun)( run)? test\b|\b(jest|vitest|pytest|mocha|rspec|phpunit)\b|\b(cargo|go|make|dotnet) test\b/;
// Counts must be nonzero, so "0 failed" and "0 skipped" do not trip them.
const TEST_FAILED = /^FAIL\b|\bFAILED\b|\b[1-9]\d* (failed|failing|errors?)\b/m;
const TEST_SKIPPED = /\b[1-9]\d* (skipped|pending|todo)\b/i;
const PASS_CLAIM =
  /\b(all|every)\b.{0,30}\btests?\b.{0,20}\b(pass|green)|\btests? (are |now |all )*(pass(es|ing)?|green)\b/i;

const COMMAND_RULES: { rule: string; label: string; severity: Severity; test: RegExp }[] = [
  { rule: "force-push", label: "Force push", severity: "high", test: /\bgit push\b.*(--force|\s-f\b)/ },
  { rule: "hard-reset", label: "Hard reset", severity: "high", test: /\bgit reset --hard\b/ },
  { rule: "delete", label: "Recursive delete", severity: "high", test: /\brm\s+-\w*r/ },
  { rule: "pipe-to-shell", label: "Script piped to shell", severity: "high", test: /\bcurl\b[^|]*\|\s*(ba|z)?sh\b/ },
  { rule: "dependency", label: "New dependency", severity: "low", test: /\b(npm|pnpm|yarn|bun) (install|add|i)\b(?=.*\s[^-\s])|\bpip install\b|\bcargo add\b/ },
];

// ".env" as a file (not process.env), key assignments, and key-shaped tokens.
const SECRET_TEXT = /((^|[\s/"'=])\.env(\.\w+)?\b|\b\w*(API_KEY|SECRET|TOKEN)\w*=|sk-[A-Za-z0-9_-]{12,})/;

export function flagSession(steps: Step[]): Flag[] {
  const flags: Flag[] = [];
  const add = (step: number, rule: string, label: string, severity: Severity) =>
    flags.push({ step, rule, label, severity });

  let lastTest: Step | null = null;

  for (const s of steps) {
    if (s.kind === "command") {
      for (const r of COMMAND_RULES) if (r.test.test(s.head)) add(s.index, r.rule, r.label, r.severity);
      if (SECRET_TEXT.test(s.head) || s.body.some((l) => SECRET_TEXT.test(l))) {
        add(s.index, "secrets", "Touches secrets", "high");
      }
      if (TEST_COMMAND.test(s.head)) lastTest = s;
    }
    if (s.kind === "diff") {
      const added = addedLines(s);
      if (added.some((l) => /\.(skip|only)\(|\bxit\(|@pytest\.mark\.skip/.test(l))) {
        add(s.index, "skipped-test", "Test skipped in diff", "medium");
      }
      if (/migrations?\//.test(s.head)) add(s.index, "migration", "Migration changed", "medium");
      if (SECRET_TEXT.test(s.head) || added.some((l) => SECRET_TEXT.test(l))) {
        add(s.index, "secrets", "Touches secrets", "high");
      }
    }
    if (s.kind === "agent" && PASS_CLAIM.test(s.head) && lastTest) {
      const out = lastTest.body.join("\n");
      if (TEST_FAILED.test(out) || TEST_SKIPPED.test(out)) {
        add(s.index, "claim-mismatch", `Claim contradicts step ${lastTest.index}`, "medium");
      }
    }
  }

  if (lastTest && TEST_FAILED.test(lastTest.body.join("\n"))) {
    add(lastTest.index, "tests-failing", "Last test run failed", "medium");
  }

  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return flags.sort((a, b) => order[a.severity] - order[b.severity] || a.step - b.step);
}

// Labeled on the page as a made-up sample. Not a real Warp or Oz session.
export const SAMPLE_SESSION = `agent: Task: fix the failing date test in billing. Running the billing tests first.
$ npm test -- billing
FAIL src/billing/invoice.test.ts
  x formats the due date (expected "Mar 1", received "Feb 28")
Tests: 1 failed, 11 passed, 12 total
agent: The formatter uses local time. Switching it to UTC with date-fns-tz.
$ npm install date-fns-tz
added 1 package in 2s
diff --git a/src/billing/format.ts b/src/billing/format.ts
--- a/src/billing/format.ts
+++ b/src/billing/format.ts
-import { format } from "date-fns";
+import { formatInTimeZone } from "date-fns-tz";
 export function dueDate(d: Date) {
-  return format(d, "MMM d");
+  return formatInTimeZone(d, "UTC", "MMM d");
 }
diff --git a/src/billing/invoice.test.ts b/src/billing/invoice.test.ts
--- a/src/billing/invoice.test.ts
+++ b/src/billing/invoice.test.ts
-  it("handles the DST boundary", () => {
+  it.skip("handles the DST boundary", () => {
$ npm test -- billing
PASS src/billing/invoice.test.ts
Tests: 1 skipped, 11 passed, 12 total
$ git push --force origin fix/billing-dates
+ 3f2a1c9...8be04d2 fix/billing-dates -> fix/billing-dates (forced update)
agent: Done. All billing tests pass.`;
