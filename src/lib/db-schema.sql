CREATE TABLE IF NOT EXISTS reviewer_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_text text NOT NULL,
  label text NOT NULL CHECK (label IN ('signal', 'noise', 'context', 'neutral')),
  confidence float,
  repo text,
  reviewer text,
  pr_number text,
  greptile_adjusted boolean DEFAULT false,
  original_label text,
  created_at timestamp with time zone DEFAULT now()
);
