import {
  fetchJiraTickets,
  fetchLinearTickets,
  correlateTickets,
  type JiraCreds,
  type LinearCreds,
  type CorrelatedTicket,
} from "@/lib/bug-tracker";
import {
  storeComments,
  getCommentCount,
  type AnalyzedComment,
  type CommentLabel,
} from "@/lib/supabase";

export const maxDuration = 60;

// ── Types echoed by the client ────────────────────────────────────────────────

type Cls = "Signal" | "Noise" | "Context" | "Neutral";
type Sev = "Critical" | "High" | "Medium" | "Low" | "None";

interface CommentRow {
  reviewer: string;
  summary: string;
  original: Cls;
  adjusted: Cls;
  reason: string;
  severity: Sev;
  confidence: number;
}
interface Archetype { label: string; pct: number }
interface ReviewerDNA {
  reviewer: string;
  signalPct: number;
  comments: number;
  signals: number;
  archetypes: Archetype[];
  codebaseScore: number;
  caught: string[];
  missed: string[];
  verdict: string;
}
interface CodebaseFinding {
  text: string;
  status: "Caught by human" | "Missed by human" | "Systemic issue";
  attribution?: string;
}

// ── GitHub helpers (kept local to avoid touching iteration 1 route) ──────────

interface GitHubFile { filename: string; status: string; additions: number; deletions: number; patch?: string }
interface GitHubComment { id: number; user: { login: string }; body: string; path?: string; line?: number; original_line?: number; created_at: string }
interface GitHubReview { user: { login: string }; state: string; body: string }
interface GitHubIssueComment { id: number; user: { login: string }; body: string; created_at: string }
interface GitHubPR {
  title: string;
  body: string | null;
  user: { login: string };
  created_at: string;
  merged_at: string | null;
  changed_files: number;
  additions: number;
  deletions: number;
  state: string;
  merged: boolean;
}

function ghHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN;
  return {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "pr-review-auditor",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function ghFetch<T>(url: string, label = ""): Promise<{ data: T; status: number; raw: string }> {
  const res = await fetch(url, { headers: ghHeaders() });
  const raw = await res.text();
  console.log(`[greptile-v2] GH ${label || url} -> ${res.status}; len=${raw.length}; preview=${raw.slice(0, 200)}`);
  let data: T;
  try {
    data = JSON.parse(raw) as T;
  } catch {
    data = (raw as unknown) as T;
  }
  return { data, status: res.status, raw };
}

// ── Greptile (best-effort, falls back to Anthropic-only on failure) ──────────

// Repos larger than this (in KB, from GitHub's repo metadata) are skipped
// rather than waiting for Greptile to time out. ~100 MB covers typical
// monorepos like facebook/react (~250 MB) and vercel/next.js (~400 MB).
const LARGE_REPO_KB = 100_000;
const INDEX_TIMEOUT_MS = 30_000;
const QUERY_TIMEOUT_MS = 25_000;

interface GreptileStatus {
  ok: boolean;
  reason: "ok" | "no_key" | "no_github_token" | "large_repo" | "indexing_in_progress" | "index_error" | "query_error" | "timeout" | "no_content";
  message?: string;
  httpStatus?: number;
  rawPreview?: string;
}

async function tryGreptileIndex(
  repo: string,
  branch: string
): Promise<GreptileStatus> {
  const key = process.env.GREPTILE_API_KEY;
  const ghToken = process.env.GITHUB_TOKEN;
  if (!key) return { ok: false, reason: "no_key" };
  if (!ghToken) return { ok: false, reason: "no_github_token" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), INDEX_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.greptile.com/v2/repositories", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "X-GitHub-Token": ghToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ remote: "github", repository: repo, branch }),
    });
    clearTimeout(timer);

    const raw = await res.text();
    const preview = raw.slice(0, 500);
    console.log(`[greptile-v2] greptile INDEX -> ${res.status}; ct=${res.headers.get("content-type") ?? "?"}; preview=${preview}`);

    if (!res.ok) {
      return { ok: false, reason: "index_error", httpStatus: res.status, rawPreview: preview };
    }
    // Greptile returns 200 with a status field. Possible statuses:
    // "submitted", "cloning", "processing", "completed". Only "completed"
    // means the index is queryable now.
    let parsed: { status?: string; remote?: string } = {};
    try { parsed = JSON.parse(raw) as { status?: string }; } catch {}
    if (parsed.status && parsed.status !== "completed") {
      return {
        ok: false,
        reason: "indexing_in_progress",
        message: "Greptile is still indexing this repo. Try again in a minute.",
        httpStatus: res.status,
        rawPreview: preview,
      };
    }
    return { ok: true, reason: "ok", httpStatus: res.status, rawPreview: preview };
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
    if (isAbort) {
      return {
        ok: false,
        reason: "timeout",
        message: "Codebase indexing skipped for large repos. Analysis based on diff context only.",
      };
    }
    console.log("[greptile-v2] greptile INDEX threw:", err);
    return { ok: false, reason: "index_error", message: err instanceof Error ? err.message : String(err) };
  }
}

interface GreptileQueryResult { content?: string; message?: string; sources?: unknown[] }

async function greptileQuery(
  repo: string,
  branch: string,
  question: string
): Promise<{ status: GreptileStatus; result: GreptileQueryResult | null }> {
  const key = process.env.GREPTILE_API_KEY;
  const ghToken = process.env.GITHUB_TOKEN;
  if (!key) return { status: { ok: false, reason: "no_key" }, result: null };
  if (!ghToken) return { status: { ok: false, reason: "no_github_token" }, result: null };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), QUERY_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.greptile.com/v2/query", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "X-GitHub-Token": ghToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: question }],
        repositories: [{ remote: "github", repository: repo, branch }],
        sessionId: `pr-audit-${Date.now()}`,
      }),
    });
    clearTimeout(timer);

    const raw = await res.text();
    const preview = raw.slice(0, 500);
    console.log(`[greptile-v2] greptile QUERY -> ${res.status}; ct=${res.headers.get("content-type") ?? "?"}; preview=${preview}`);

    if (!res.ok) {
      return {
        status: { ok: false, reason: "query_error", httpStatus: res.status, rawPreview: preview },
        result: null,
      };
    }
    let parsed: GreptileQueryResult = {};
    try { parsed = JSON.parse(raw) as GreptileQueryResult; } catch {}
    const content = parsed.content ?? parsed.message ?? "";
    if (!content.trim()) {
      return {
        status: { ok: false, reason: "no_content", httpStatus: res.status, rawPreview: preview },
        result: null,
      };
    }
    return { status: { ok: true, reason: "ok", httpStatus: res.status }, result: { ...parsed, content } };
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
    if (isAbort) {
      return {
        status: {
          ok: false,
          reason: "timeout",
          message: "Codebase indexing skipped for large repos. Analysis based on diff context only.",
        },
        result: null,
      };
    }
    console.log("[greptile-v2] greptile QUERY threw:", err);
    return {
      status: { ok: false, reason: "query_error", message: err instanceof Error ? err.message : String(err) },
      result: null,
    };
  }
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

interface AnthropicAnalysis {
  comments: CommentRow[];
  reviewerDNA: ReviewerDNA[];
  codebaseFindings: CodebaseFinding[];
  datasetCount: number | null;
}

async function runAnalysis(args: {
  pr: GitHubPR;
  diffContext: string;
  commentContext: string;
  reviewContext: string;
  greptileNotes: string;
}): Promise<AnthropicAnalysis> {
  const userPrompt = `You are analyzing a GitHub pull request for a tool that scores review comments by signal vs noise, layered with codebase context.

Return ONLY a single valid JSON object. No markdown fences. No preamble. No explanation.

PR TITLE: ${args.pr.title}
DESCRIPTION: ${args.pr.body?.slice(0, 600) ?? "(none)"}
AUTHOR: ${args.pr.user.login}
FILES CHANGED: ${args.pr.changed_files}
LINES: +${args.pr.additions} / -${args.pr.deletions}

DIFF (truncated):
${args.diffContext.slice(0, 7000)}

REVIEW COMMENTS:
${args.commentContext.slice(0, 4000)}

REVIEW SUMMARIES:
${args.reviewContext.slice(0, 1000)}

CODEBASE CONTEXT NOTES (from codebase index, may be empty):
${args.greptileNotes.slice(0, 2000) || "(no codebase index notes available; reason about likely conventions from the diff alone)"}

Score every review comment twice. The "original" score is the generic signal/noise read. The "adjusted" score factors in codebase conventions: a comment is Noise if it fights an established convention, Context if it is technically right but cosmetically inconsistent with the rest of the codebase, Signal if it is right and aligned, Neutral if it is praise or a question. Also produce a "confidence" between 0 and 1 reflecting how sure you are about the adjusted classification (1 = fully certain, 0.5 = could go either way, 0 = pure guess).

Then cluster every reviewer's comments into 3 to 5 concern archetypes (e.g. "Security and Auth", "Performance", "Style and Formatting", "Readability", "Consistency"). Score each reviewer 0 to 100 on codebase knowledge based on how well their comments reflect actual codebase patterns.

Return EXACTLY this JSON shape:
{
  "comments": [
    {
      "reviewer": string,
      "summary": string (concise restatement, no em dashes),
      "original": "Signal" | "Noise" | "Neutral",
      "adjusted": "Signal" | "Noise" | "Context" | "Neutral",
      "reason": string (1-2 sentences citing codebase context if relevant, no em dashes),
      "severity": "Critical" | "High" | "Medium" | "Low" | "None",
      "confidence": number between 0 and 1
    }
  ],
  "reviewerDNA": [
    {
      "reviewer": string,
      "signalPct": number (0-100),
      "comments": number,
      "signals": number,
      "archetypes": [{ "label": string, "pct": number }],
      "codebaseScore": number (0-100),
      "caught": [string],
      "missed": [string],
      "verdict": string (one sentence, no em dashes)
    }
  ],
  "codebaseFindings": [
    {
      "text": string (one sentence, no em dashes),
      "status": "Caught by human" | "Missed by human" | "Systemic issue",
      "attribution": string (reviewer name, optional)
    }
  ]
}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 50000);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: ctrl.signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system:
        "You are a senior software engineer specializing in code review quality and codebase intelligence. You produce concise, codebase-aware re-scoring of PR review comments. Do not use em dashes anywhere in your response. Output JSON only.",
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  clearTimeout(timer);

  const raw = await res.text();
  if (!res.ok) throw new Error(`Analysis API error ${res.status}`);

  const parsed = JSON.parse(raw) as { content: { text: string }[] };
  const text = parsed.content[0].text.replace(/```json|```/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}") + 1;
  if (start === -1 || end === 0) throw new Error("Analysis did not return valid JSON.");
  const analysis = JSON.parse(text.slice(start, end)) as Omit<AnthropicAnalysis, "datasetCount">;

  // Normalize confidence: clamp to [0,1]; backfill from the adjusted label if
  // the model omitted the field. Signal/Noise/Context are decisive (0.85),
  // Neutral is intrinsically uncertain (0.5).
  analysis.comments = (analysis.comments ?? []).map(c => {
    const raw = typeof c.confidence === "number" ? c.confidence : NaN;
    const fallback = c.adjusted === "Neutral" ? 0.5 : 0.85;
    const conf = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : fallback;
    return { ...c, confidence: conf };
  });

  return { ...analysis, datasetCount: null };
}

// ── Main route ────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      prUrl: string;
      jira?: JiraCreds;
      linear?: LinearCreds;
    };
    const { prUrl, jira, linear } = body;

    console.log("[greptile-v2] hit", { prUrl, hasJira: !!jira, hasLinear: !!linear });
    console.log("[greptile-v2] env:", {
      GITHUB_TOKEN_present: !!process.env.GITHUB_TOKEN,
      GITHUB_TOKEN_prefix: process.env.GITHUB_TOKEN?.slice(0, 4),
      ANTHROPIC_API_KEY_present: !!process.env.ANTHROPIC_API_KEY,
      GREPTILE_API_KEY_present: !!process.env.GREPTILE_API_KEY,
    });

    const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) {
      console.log("[greptile-v2] URL parse failed for:", prUrl);
      return Response.json(
        { error: "Please enter a valid GitHub PR URL (github.com/owner/repo/pull/123)" },
        { status: 400 }
      );
    }
    const [, owner, repo, prNumber] = match;
    const repoPath = `${owner}/${repo}`;
    const base = `https://api.github.com/repos/${repoPath}/pulls/${prNumber}`;
    const issueBase = `https://api.github.com/repos/${repoPath}/issues/${prNumber}`;

    console.log("[greptile-v2] parsed:", { owner, repo, prNumber, base });

    // Fetch PR metadata
    const prRes = await ghFetch<GitHubPR>(base, "PR");

    if (prRes.status === 404) {
      // Disambiguate: GitHub shares numbering between issues and PRs in a repo,
      // so a 404 on /pulls/{n} can mean "this number is an issue, not a PR."
      const issueProbe = await ghFetch<{ pull_request?: unknown; title?: string }>(issueBase, "issue-probe");
      if (issueProbe.status === 200 && !issueProbe.data?.pull_request) {
        return Response.json(
          { error: `That URL is an issue, not a pull request. Issue #${prNumber} of ${repoPath} exists, but no PR uses that number. Try a /pull/ URL.` },
          { status: 404 }
        );
      }
      if (issueProbe.status === 404) {
        return Response.json(
          { error: `${repoPath} has no PR or issue numbered #${prNumber}. Check the URL.` },
          { status: 404 }
        );
      }
      return Response.json({ error: `PR not found at ${repoPath}#${prNumber}.` }, { status: 404 });
    }
    if (prRes.status === 403) {
      const msg = (prRes.data as unknown as { message?: string })?.message ?? "";
      if (msg.includes("rate limit")) {
        return Response.json({ error: "GitHub API rate limit reached. Try again later." }, { status: 429 });
      }
      return Response.json({ error: "Repository is private." }, { status: 403 });
    }
    if (prRes.status === 401) {
      return Response.json({ error: "GitHub token rejected. Check GITHUB_TOKEN." }, { status: 401 });
    }
    if (prRes.status !== 200) {
      return Response.json({ error: `GitHub API error ${prRes.status}.` }, { status: 500 });
    }

    const [filesRes, reviewsRes, commentsRes, issueCommentsRes, repoInfoRes] = await Promise.all([
      ghFetch<GitHubFile[]>(`${base}/files`, "files"),
      ghFetch<GitHubReview[]>(`${base}/reviews`, "reviews"),
      ghFetch<GitHubComment[]>(`${base}/comments`, "inline-comments"),
      ghFetch<GitHubIssueComment[]>(`${issueBase}/comments`, "issue-comments"),
      ghFetch<{ size?: number; default_branch?: string }>(`https://api.github.com/repos/${repoPath}`, "repo-info"),
    ]);

    const pr = prRes.data;
    const files = Array.isArray(filesRes.data) ? filesRes.data : [];
    const reviews = Array.isArray(reviewsRes.data) ? reviewsRes.data : [];
    const inlineComments = Array.isArray(commentsRes.data) ? commentsRes.data : [];
    const issueComments = Array.isArray(issueCommentsRes.data) ? issueCommentsRes.data : [];

    // Treat top-level PR conversation (issue endpoint) as comments too, since
    // many PRs have all their discussion at the top level rather than inline.
    const comments: GitHubComment[] = [
      ...inlineComments,
      ...issueComments.map((c): GitHubComment => ({
        id: c.id,
        user: c.user,
        body: c.body,
        path: undefined,
        line: undefined,
        original_line: undefined,
        created_at: c.created_at,
      })),
    ];

    console.log("[greptile-v2] counts:", {
      files: files.length,
      reviews: reviews.length,
      reviewsWithBody: reviews.filter(r => r.body?.trim()).length,
      inlineComments: inlineComments.length,
      issueComments: issueComments.length,
      mergedComments: comments.length,
    });

    if (comments.length === 0 && reviews.filter(r => r.body?.trim()).length === 0) {
      return Response.json(
        { error: `This PR has no review comments or discussion yet (checked /pulls/${prNumber}/reviews, /pulls/${prNumber}/comments, /issues/${prNumber}/comments). Try a merged PR with active discussion.` },
        { status: 422 }
      );
    }

    const diffContext = files
      .map(f => `FILE: ${f.filename} (+${f.additions} -${f.deletions})\n${(f.patch ?? "").split("\n").slice(0, 200).join("\n")}`)
      .join("\n\n---\n\n");
    const commentContext = comments
      .map((c, i) => `COMMENT ${i + 1}:\nAuthor: ${c.user.login}\nFile: ${c.path ?? "general"}\nLine: ${c.line ?? c.original_line ?? "N/A"}\nBody: ${c.body}`)
      .join("\n\n");
    const reviewContext = reviews
      .filter(r => r.body?.trim())
      .map(r => `REVIEW (${r.user.login}, ${r.state}): ${r.body}`)
      .join("\n\n");

    // ── Greptile (best-effort with size pre-check + better diagnostics) ─────
    const repoSizeKB = repoInfoRes.data?.size ?? 0;
    const defaultBranch = repoInfoRes.data?.default_branch ?? "main";
    console.log(`[greptile-v2] repo info: size=${repoSizeKB} KB, default_branch=${defaultBranch}`);

    let greptileNotes = "";
    let greptileStatus: GreptileStatus;

    if (repoSizeKB > LARGE_REPO_KB) {
      greptileStatus = {
        ok: false,
        reason: "large_repo",
        message: "Codebase indexing skipped for large repos. Analysis based on diff context only.",
      };
      console.log(`[greptile-v2] skipping Greptile: repo size ${repoSizeKB} KB exceeds ${LARGE_REPO_KB} KB threshold`);
    } else {
      const indexStatus = await tryGreptileIndex(repoPath, defaultBranch);
      if (!indexStatus.ok) {
        greptileStatus = indexStatus;
      } else {
        const { status: queryStatus, result } = await greptileQuery(
          repoPath,
          defaultBranch,
          `Summarize codebase conventions relevant to this PR: ${pr.title}. Files changed: ${files.map(f => f.filename).slice(0, 10).join(", ")}. Highlight any naming conventions, repeated patterns, or systemic gaps relevant to the review comments.`
        );
        if (queryStatus.ok && result?.content) {
          greptileNotes = result.content;
          greptileStatus = { ok: true, reason: "ok" };
        } else {
          greptileStatus = queryStatus;
        }
      }
    }

    // `degraded` is the legacy flag the client used to display a fallback pill.
    // Kept for backwards compatibility; the canonical signal is `greptileStatus`.
    const degraded = !greptileStatus.ok;
    console.log("[greptile-v2] greptileStatus:", greptileStatus);

    // Anthropic analysis
    const analysis = await runAnalysis({ pr, diffContext, commentContext, reviewContext, greptileNotes });

    // Persist analyzed comments to Supabase. Best-effort: a DB failure should
    // not break the analysis response. If Supabase is not configured the call
    // is a no-op and returns ok:false with a benign reason.
    const supabaseRows: AnalyzedComment[] = analysis.comments.map(c => ({
      comment_text: c.summary,
      label: c.adjusted.toLowerCase() as CommentLabel,
      confidence: c.confidence,
      reviewer: c.reviewer,
      original_label: c.original.toLowerCase(),
      greptile_adjusted: c.adjusted !== c.original,
    }));
    const storeRes = await storeComments(supabaseRows, { repo: repoPath, pr_number: prNumber });
    console.log("[greptile-v2] storeComments:", storeRes);

    // Bug tracker correlation
    const mergeDate = pr.merged_at ? new Date(pr.merged_at) : new Date(pr.created_at);
    let bugTickets: CorrelatedTicket[] = [];
    let trackerStatus: { ok: boolean; ticketsScanned: number; project?: string } | null = null;

    const flaggedComments = analysis.comments
      .filter(c => c.adjusted === "Signal" || c.adjusted === "Context")
      .map(c => {
        const original = comments.find(cc => cc.body && c.summary && cc.body.toLowerCase().includes(c.summary.split(" ").slice(0, 3).join(" ").toLowerCase()));
        return { reviewer: c.reviewer, files: original?.path ? [original.path] : [], summary: c.summary };
      });
    const prFiles = files.map(f => f.filename);

    try {
      if (jira) {
        const tickets = await fetchJiraTickets(jira, mergeDate);
        bugTickets = correlateTickets(tickets, mergeDate, prFiles, flaggedComments);
        trackerStatus = { ok: true, ticketsScanned: tickets.length, project: jira.projectKey };
      } else if (linear) {
        const tickets = await fetchLinearTickets(linear, mergeDate);
        bugTickets = correlateTickets(tickets, mergeDate, prFiles, flaggedComments);
        trackerStatus = { ok: true, ticketsScanned: tickets.length };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bug tracker connection failed.";
      return Response.json({ error: msg }, { status: 502 });
    }

    // ── ROI computation ──────────────────────────────────────────────────────
    // Industry-standard estimated costs per severity tier. Every dollar amount
    // produced here is an estimate unless a bug tracker is connected and
    // returned correlated tickets.
    const COST_CRITICAL = 5000;
    const COST_MEDIUM = 1000;
    const COST_LOW = 200;
    const NOISE_MIN_PER_COMMENT = 10;

    const allComments = analysis.comments;
    const noiseCount = allComments.filter(c => c.adjusted === "Noise").length;
    const criticalCount = allComments.filter(c => c.adjusted === "Signal" && c.severity === "Critical").length;
    const mediumCount = allComments.filter(c => c.adjusted === "Signal" && c.severity === "Medium").length;
    const lowCount = allComments.filter(c => c.adjusted === "Signal" && c.severity === "Low").length;

    let noiseMinutes = noiseCount * NOISE_MIN_PER_COMMENT;
    let estimatedRemediation =
      criticalCount * COST_CRITICAL +
      mediumCount * COST_MEDIUM +
      lowCount * COST_LOW;

    // Floor: if there are any comments at all, never show $0 or 0 minutes. This
    // keeps the ROI card meaningful even when the analysis surfaces only High
    // severity signals (no severity bracket the spec explicitly priced) or
    // pure-style chatter.
    if (allComments.length > 0) {
      if (noiseMinutes === 0) noiseMinutes = NOISE_MIN_PER_COMMENT;
      if (estimatedRemediation === 0) estimatedRemediation = COST_LOW;
    }

    const realRemediation = bugTickets.reduce((s, t) => s + t.costUSD, 0);
    const isReal = !!trackerStatus?.ok && bugTickets.length > 0;
    const noCorrelation = !!trackerStatus?.ok && bugTickets.length === 0;
    const remediationCostUSD = isReal ? realRemediation : estimatedRemediation;
    const sourceLabel = isReal ? "" : " (estimated)";

    const roi = {
      topLine: noCorrelation
        ? `No production bugs filed against the files this PR touched in the 30 days after merge.`
        : isReal
        ? `${trackerStatus!.ticketsScanned} tickets scanned. ${bugTickets.length} correlated to this PR. Real review process cost: $${realRemediation.toLocaleString()}.`
        : `This review left ${noiseMinutes} minutes on noise and surfaced ${criticalCount} critical issue${criticalCount === 1 ? "" : "s"}. Estimated remediation if those had been missed: $${estimatedRemediation.toLocaleString()}.`,
      noiseMinutes,
      missedCritical: criticalCount,
      bugsToProduction: bugTickets.length,
      remediationCostUSD,
      totalHours: +(noiseMinutes / 60).toFixed(2),
      bottomLine: noCorrelation
        ? `Clean review. Your reviewers are catching what matters in this part of the codebase.`
        : `This PR review process cost the team an estimated ${(noiseMinutes / 60).toFixed(2)} hours and $${remediationCostUSD.toLocaleString()}${sourceLabel} in bug remediation.`,
      source: noCorrelation ? "no_correlation" : isReal ? "real" : "estimated",
      ticketsScanned: trackerStatus?.ticketsScanned,
      projectKey: trackerStatus?.project,
    };

    const result = {
      repo: repoPath,
      prTitle: pr.title,
      prNumber: Number(prNumber),
      reviewers: [...new Set(comments.map(c => c.user.login).concat(reviews.map(r => r.user.login)))],
      comments: analysis.comments,
      reviewerDNA: analysis.reviewerDNA,
      codebaseFindings: analysis.codebaseFindings,
      bugTickets: bugTickets.map(t => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        daysAfterMerge: t.daysAfterMerge,
        reviewerLink: t.reviewerLink,
        costUSD: t.costUSD,
        status: t.status,
      })),
      roi,
      datasetCount: await getCommentCount(),
      contributedThisSession: analysis.comments.length,
    };

    return Response.json({ result, degraded, greptileStatus, trackerStatus });
  } catch (err) {
    console.error("[greptile-v2] error:", err);
    const msg = err instanceof Error ? err.message : "Analysis failed.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
