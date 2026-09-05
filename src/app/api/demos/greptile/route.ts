export const maxDuration = 60;

interface GitHubFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

interface GitHubComment {
  id: number;
  user: { login: string };
  body: string;
  path?: string;
  line?: number;
  original_line?: number;
  created_at: string;
}

interface GitHubReview {
  user: { login: string };
  state: string;
  body: string;
}

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
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function ghFetch<T>(url: string): Promise<{ data: T; status: number }> {
  const res = await fetch(url, { headers: ghHeaders() });
  const data = await res.json() as T;
  return { data, status: res.status };
}

export async function POST(request: Request) {
  console.log("[greptile] hit");

  console.log("GITHUB_TOKEN present:", !!process.env.GITHUB_TOKEN)
  console.log("GITHUB_TOKEN first 4 chars:", process.env.GITHUB_TOKEN?.slice(0, 4))

  try {
    const body = await request.json() as { prUrl: string };
    console.log("Request body:", body)
    const { prUrl } = body;

    // Parse PR URL
    const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) {
      return Response.json(
        { error: "Please enter a valid GitHub PR URL (github.com/owner/repo/pull/123)" },
        { status: 400 }
      );
    }
    const [, owner, repo, prNumber] = match;
    const base = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;

    console.log(`[greptile] fetching ${owner}/${repo}#${prNumber}`);

    // Fetch PR metadata first to log raw response before parsing
    const prRawRes = await fetch(base, { headers: ghHeaders() });
    const prRawBody = await prRawRes.text();
    console.log("[greptile] PR metadata status:", prRawRes.status);
    console.log("[greptile] PR metadata raw body:", prRawBody.slice(0, 500));
    const prRes = { data: JSON.parse(prRawBody) as GitHubPR, status: prRawRes.status };

    // Fetch remaining three endpoints in parallel
    const [filesRes, reviewsRes, commentsRes] = await Promise.all([
      ghFetch<GitHubFile[]>(`${base}/files`),
      ghFetch<GitHubReview[]>(`${base}/reviews`),
      ghFetch<GitHubComment[]>(`${base}/comments`),
    ]);

    // Handle GitHub errors
    if (prRes.status === 404) {
      return Response.json({ error: "PR not found. Check the URL and try again." }, { status: 404 });
    }
    if (prRes.status === 403) {
      const msg = (prRes.data as unknown as { message?: string })?.message ?? "";
      if (msg.includes("rate limit")) {
        return Response.json({ error: "GitHub API rate limit reached. Please try again in a few minutes." }, { status: 429 });
      }
      return Response.json({ error: "This repository is private. Please use a public PR." }, { status: 403 });
    }
    if (prRes.status !== 200) {
      return Response.json({ error: `GitHub API error ${prRes.status}.` }, { status: 500 });
    }

    const pr = prRes.data;
    const files = Array.isArray(filesRes.data) ? filesRes.data : [];
    const reviews = Array.isArray(reviewsRes.data) ? reviewsRes.data : [];
    const comments = Array.isArray(commentsRes.data) ? commentsRes.data : [];

    if (comments.length === 0 && reviews.filter(r => r.body?.trim()).length === 0) {
      return Response.json(
        { error: "This PR has no review comments yet. Try a merged PR with active discussion." },
        { status: 422 }
      );
    }

    // Build diff context — truncate each file's patch to keep context manageable
    const diffContext = files
      .map(f => {
        const lines = (f.patch ?? "").split("\n").slice(0, 200).join("\n");
        return `FILE: ${f.filename} (+${f.additions} -${f.deletions})\n${lines}`;
      })
      .join("\n\n---\n\n");

    // Build comment context
    const commentContext = comments
      .map((c, i) =>
        `COMMENT ${i + 1}:\nAuthor: ${c.user.login}\nFile: ${c.path ?? "general"}\nLine: ${c.line ?? c.original_line ?? "N/A"}\nBody: ${c.body}`
      )
      .join("\n\n");

    const reviewContext = reviews
      .filter(r => r.body?.trim())
      .map(r => `REVIEW (${r.user.login}, ${r.state}): ${r.body}`)
      .join("\n\n");

    const userPrompt = `Analyze this pull request and return ONLY a valid JSON object with no markdown, no preamble, no explanation.

PR TITLE: ${pr.title}
PR DESCRIPTION: ${pr.body?.slice(0, 500) ?? "(none)"}
AUTHOR: ${pr.user.login}
FILES CHANGED: ${pr.changed_files}
LINES ADDED: ${pr.additions}
LINES REMOVED: ${pr.deletions}

DIFF:
${diffContext.slice(0, 8000)}

REVIEW COMMENTS:
${commentContext.slice(0, 4000)}

REVIEW SUMMARIES:
${reviewContext.slice(0, 1000)}

Return this exact JSON shape:
{
  "pr_summary": {
    "title": string,
    "files_changed": number,
    "lines_added": number,
    "lines_removed": number,
    "complexity": "Low" | "Medium" | "High" | "Very High",
    "complexity_reason": string
  },
  "review_health": {
    "score": number (0-100),
    "grade": "A" | "B" | "C" | "D" | "F",
    "signal_count": number,
    "noise_count": number,
    "signal_percentage": number,
    "verdict": string (one sentence, no em dashes)
  },
  "comments": [
    {
      "author": string,
      "body": string,
      "file": string,
      "category": "Bug" | "Security" | "Performance" | "Architecture" | "Style" | "Naming" | "Formatting" | "Preference" | "Praise" | "Question",
      "classification": "Signal" | "Noise" | "Neutral",
      "severity": "Critical" | "High" | "Medium" | "Low" | "None",
      "reasoning": string (1-2 sentences, no em dashes)
    }
  ],
  "missed_issues": [
    {
      "file": string,
      "issue": string,
      "severity": "Critical" | "High" | "Medium" | "Low",
      "category": "Bug" | "Security" | "Performance" | "Architecture",
      "line_reference": string,
      "what_greptile_would_say": string (written as a direct code review comment, no em dashes)
    }
  ],
  "reviewer_scores": [
    {
      "reviewer": string,
      "comments_left": number,
      "signal_count": number,
      "noise_count": number,
      "signal_ratio": number (0-1),
      "top_category": string
    }
  ],
  "summary": string (2-3 sentences summarizing the overall review quality, no em dashes)
}`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 55000);

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system:
          "You are a senior software engineer and code review expert. You have deep knowledge of what makes code review feedback valuable vs wasteful. You analyze PR diffs and review comments with the precision of someone who has reviewed thousands of PRs. You are direct and specific -- you reference actual code and actual comments in your analysis. Do not use em dashes anywhere in your response.",
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    clearTimeout(timer);

    const raw = await apiRes.text();
    console.log("[greptile] anthropic status:", apiRes.status);

    if (!apiRes.ok) {
      return Response.json({ error: `Analysis API error ${apiRes.status}: ${raw.slice(0, 200)}` }, { status: 500 });
    }

    const anthropicData = JSON.parse(raw) as { content: { text: string }[] };
    const text = anthropicData.content[0].text.replace(/```json|```/g, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}") + 1;
    if (start === -1 || end === 0) {
      console.error("[greptile] no JSON found in:", text.slice(0, 300));
      return Response.json({ error: "Analysis did not return valid JSON." }, { status: 500 });
    }

    const result = JSON.parse(text.slice(start, end));
    console.log("[greptile] parsed ok, comments:", result.comments?.length, "missed:", result.missed_issues?.length);
    return Response.json({ result });
  } catch (err) {
    console.error("[greptile] error:", err);
    return Response.json({ error: "Analysis failed. Please try again or use the sample PR." }, { status: 500 });
  }
}
