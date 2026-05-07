import { fetchJiraTickets, type JiraCreds } from "@/lib/bug-tracker";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      creds?: Partial<JiraCreds>;
      prMergeDate?: string;
      windowDays?: number;
    };

    const creds = body.creds ?? {};
    const required: (keyof JiraCreds)[] = ["baseUrl", "email", "token", "projectKey"];
    const missing = required.filter(k => !creds[k]);
    if (missing.length > 0) {
      return Response.json(
        { error: `Missing Jira credentials: ${missing.join(", ")}.` },
        { status: 400 }
      );
    }

    const mergeDate = body.prMergeDate ? new Date(body.prMergeDate) : new Date();
    if (Number.isNaN(mergeDate.getTime())) {
      return Response.json({ error: "Invalid prMergeDate." }, { status: 400 });
    }

    const tickets = await fetchJiraTickets(creds as JiraCreds, mergeDate, body.windowDays ?? 30);
    return Response.json({ tickets, ticketsScanned: tickets.length, project: creds.projectKey });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Jira request failed.";
    return Response.json({ error: msg }, { status: 502 });
  }
}
