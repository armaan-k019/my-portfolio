// Shared types and helpers for Jira and Linear bug-tracker integrations.
// Used by the standalone /api/jira and /api/linear routes and by the
// /api/demos/greptile-v2 orchestrator. Credentials are passed in by the
// caller and never persisted.

export type Priority = "P0" | "P1" | "P2" | "P3";

export interface NormalizedTicket {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  createdAt: string;
  resolvedAt?: string | null;
  estimateMinutes?: number | null;
}

export interface CorrelatedTicket extends NormalizedTicket {
  matchedFiles: string[];
  daysAfterMerge: number;
  costUSD: number;
  status: "missed entirely" | "flagged but merged";
  reviewerLink: string;
}

export const PRIORITY_COST: Record<Priority, number> = {
  P0: 50000, P1: 15000, P2: 5000, P3: 1000,
};

// ─── Jira ──────────────────────────────────────────────────────────────────────

export interface JiraCreds {
  baseUrl: string;
  email: string;
  token: string;
  projectKey: string;
}

interface JiraSearchResponse {
  issues: JiraIssue[];
  total?: number;
}

interface JiraIssue {
  key: string;
  fields: {
    summary?: string;
    description?: unknown;
    priority?: { name?: string };
    created?: string;
    resolutiondate?: string | null;
    timespent?: number | null;
  };
}

function normalizeJiraPriority(p?: string): Priority {
  const v = (p ?? "").toLowerCase();
  if (v.includes("highest") || v.includes("blocker") || v === "p0") return "P0";
  if (v.includes("high") || v === "p1") return "P1";
  if (v.includes("medium") || v === "p2") return "P2";
  return "P3";
}

// Atlassian Document Format → plain text (best effort)
function adfToText(node: unknown): string {
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object") return "";
  const obj = node as { text?: string; content?: unknown[] };
  if (obj.text) return obj.text;
  if (Array.isArray(obj.content)) return obj.content.map(adfToText).join(" ");
  return "";
}

export async function fetchJiraTickets(
  creds: JiraCreds,
  prMergeDate: Date,
  windowDays = 30
): Promise<NormalizedTicket[]> {
  const start = prMergeDate.toISOString().slice(0, 10);
  const end = new Date(prMergeDate.getTime() + windowDays * 86400000).toISOString().slice(0, 10);

  const jql = `project=${creds.projectKey} AND created >= "${start}" AND created <= "${end}"`;

  // Normalize baseUrl: trim whitespace, drop trailing slash, prepend https:// if
  // the user pasted a bare host like "yourco.atlassian.net". Without this, fetch
  // raises "Failed to parse URL" because the value has no scheme.
  const rawBase = (creds.baseUrl ?? "").trim().replace(/\/+$/, "");
  const normalizedBase = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;

  let url: URL;
  try {
    url = new URL("/rest/api/3/search", normalizedBase);
  } catch {
    throw new Error("Could not connect to Jira. The base URL is invalid.");
  }
  url.searchParams.set("jql", jql);
  url.searchParams.set("fields", "summary,description,priority,created,resolutiondate,timespent");
  url.searchParams.set("maxResults", "100");

  const auth = Buffer.from(`${creds.email}:${creds.token}`).toString("base64");

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error("Could not connect to Jira. Check your API token.");
  }
  if (!res.ok) {
    throw new Error(`Jira API error ${res.status}.`);
  }

  const data = (await res.json()) as JiraSearchResponse;
  const issues = Array.isArray(data.issues) ? data.issues : [];

  return issues.map(issue => ({
    id: issue.key,
    title: issue.fields.summary ?? "(no title)",
    description: adfToText(issue.fields.description),
    priority: normalizeJiraPriority(issue.fields.priority?.name),
    createdAt: issue.fields.created ?? "",
    resolvedAt: issue.fields.resolutiondate ?? null,
    estimateMinutes: issue.fields.timespent ? Math.round(issue.fields.timespent / 60) : null,
  }));
}

// ─── Linear ────────────────────────────────────────────────────────────────────

export interface LinearCreds {
  apiKey: string;
}

interface LinearIssue {
  id: string;
  identifier?: string;
  title: string;
  description?: string | null;
  priority: number;
  createdAt: string;
  completedAt?: string | null;
  estimate?: number | null;
}

interface LinearResponse {
  data?: { issues?: { nodes?: LinearIssue[] } };
  errors?: { message: string }[];
}

function normalizeLinearPriority(p: number): Priority {
  if (p === 1) return "P0";
  if (p === 2) return "P1";
  if (p === 3) return "P2";
  return "P3";
}

export async function fetchLinearTickets(
  creds: LinearCreds,
  prMergeDate: Date,
  windowDays = 30
): Promise<NormalizedTicket[]> {
  const start = prMergeDate.toISOString();
  const end = new Date(prMergeDate.getTime() + windowDays * 86400000).toISOString();

  const query = `
    query Issues($start: DateTimeOrDuration!, $end: DateTimeOrDuration!) {
      issues(
        filter: {
          createdAt: { gte: $start, lte: $end }
          labels: { name: { in: ["bug", "Bug", "BUG"] } }
        }
        first: 100
      ) {
        nodes {
          id
          identifier
          title
          description
          priority
          createdAt
          completedAt
          estimate
        }
      }
    }
  `;

  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: creds.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { start, end } }),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error("Could not connect to Linear. Check your API key.");
  }
  if (!res.ok) {
    throw new Error(`Linear API error ${res.status}.`);
  }

  const data = (await res.json()) as LinearResponse;
  if (data.errors?.length) {
    throw new Error(`Linear: ${data.errors[0].message}`);
  }

  const nodes = data.data?.issues?.nodes ?? [];
  return nodes.map(n => ({
    id: n.identifier ?? n.id,
    title: n.title,
    description: n.description ?? "",
    priority: normalizeLinearPriority(n.priority),
    createdAt: n.createdAt,
    resolvedAt: n.completedAt ?? null,
    estimateMinutes: n.estimate ? n.estimate * 60 : null,
  }));
}

// ─── Correlation ───────────────────────────────────────────────────────────────

const FILE_PATH_RE = /(?:^|[\s`(])([\w./@-]+\/[\w./-]+\.[a-zA-Z0-9]{1,6})(?=[\s`)]|$)/g;

export function extractFilePaths(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  const matches = text.matchAll(FILE_PATH_RE);
  for (const m of matches) found.add(m[1]);
  return [...found];
}

export function correlateTickets(
  tickets: NormalizedTicket[],
  prMergeDate: Date,
  prFiles: string[],
  flaggedComments: { reviewer: string; files: string[]; summary: string }[]
): CorrelatedTicket[] {
  const out: CorrelatedTicket[] = [];

  for (const t of tickets) {
    const haystack = `${t.title} ${t.description}`;
    const referenced = extractFilePaths(haystack).map(f => f.toLowerCase());
    const matches = referenced.filter(r =>
      prFiles.some(f => {
        const lower = f.toLowerCase();
        return lower === r || lower.endsWith("/" + r) || r.endsWith("/" + lower);
      })
    );
    if (matches.length === 0) continue;

    const flagged = flaggedComments.find(c =>
      c.files.some(cf => matches.includes(cf.toLowerCase()))
    );

    const created = new Date(t.createdAt);
    const daysAfter = Math.max(0, Math.round((created.getTime() - prMergeDate.getTime()) / 86400000));

    out.push({
      ...t,
      matchedFiles: [...new Set(matches)],
      daysAfterMerge: daysAfter,
      costUSD: PRIORITY_COST[t.priority] ?? PRIORITY_COST.P3,
      status: flagged ? "flagged but merged" : "missed entirely",
      reviewerLink: flagged
        ? `Touches code ${flagged.reviewer} flagged. Merged anyway.`
        : "Touches code no reviewer flagged.",
    });
  }

  return out;
}
