import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-side Supabase client. Returns null when SUPABASE_URL or
// SUPABASE_ANON_KEY are not set so callers can degrade gracefully.

let cached: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    cached = null;
    return cached;
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export type CommentLabel = "signal" | "noise" | "context" | "neutral";

export interface AnalyzedComment {
  comment_text: string;
  label: CommentLabel;
  confidence?: number | null;
  reviewer?: string | null;
  original_label?: string | null;
  greptile_adjusted?: boolean;
}

export interface CommentMeta {
  repo: string;
  pr_number: string;
}

// ─── Operations ───────────────────────────────────────────────────────────────

export async function storeComments(
  comments: AnalyzedComment[],
  meta: CommentMeta
): Promise<{ ok: boolean; inserted: number; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, inserted: 0, error: "Supabase not configured." };
  if (comments.length === 0) return { ok: true, inserted: 0 };

  const rows = comments.map(c => ({
    comment_text: c.comment_text,
    label: c.label,
    confidence: c.confidence ?? null,
    reviewer: c.reviewer ?? null,
    original_label: c.original_label ?? null,
    greptile_adjusted: c.greptile_adjusted ?? false,
    repo: meta.repo,
    pr_number: meta.pr_number,
  }));

  const { error } = await sb.from("reviewer_comments").insert(rows);
  if (error) {
    return { ok: false, inserted: 0, error: error.message };
  }
  return { ok: true, inserted: rows.length };
}

export async function getCommentCount(): Promise<number | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { count, error } = await sb
    .from("reviewer_comments")
    .select("*", { count: "exact", head: true });
  if (error) return null;
  return count ?? 0;
}
