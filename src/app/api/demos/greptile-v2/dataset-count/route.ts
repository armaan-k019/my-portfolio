import { getCommentCount } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const count = await getCommentCount();
  // count is null when Supabase is not configured or the query failed.
  // The client uses null to hide the progress bar entirely.
  return Response.json({ count });
}
