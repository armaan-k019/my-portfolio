import { fetchLinearTickets, type LinearCreds } from "@/lib/bug-tracker";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      creds?: Partial<LinearCreds>;
      prMergeDate?: string;
      windowDays?: number;
    };

    if (!body.creds?.apiKey) {
      return Response.json({ error: "Missing Linear API key." }, { status: 400 });
    }

    const mergeDate = body.prMergeDate ? new Date(body.prMergeDate) : new Date();
    if (Number.isNaN(mergeDate.getTime())) {
      return Response.json({ error: "Invalid prMergeDate." }, { status: 400 });
    }

    const tickets = await fetchLinearTickets(body.creds as LinearCreds, mergeDate, body.windowDays ?? 30);
    return Response.json({ tickets, ticketsScanned: tickets.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Linear request failed.";
    return Response.json({ error: msg }, { status: 502 });
  }
}
