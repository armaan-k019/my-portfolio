create extension if not exists vector with schema extensions;

-- Amended 2026-09-25 before first application (owner decisions, PROGRESS.md questions 7 and 11).
-- A test row and a real row may coexist at the same rounded point.
alter table sites drop constraint sites_site_key_key;
alter table sites add constraint sites_site_key_is_test_key unique (site_key, is_test);

alter table sites
  add column metrics        jsonb,                      -- named, unnormalized values; absent components omitted
  add column metrics_vector extensions.vector(14),      -- normalized 0..1; absent components hold a placeholder 0
  add column metrics_mask   smallint not null default 0, -- bit i set when component i is present (section 14)
  add column metrics_at     timestamptz;

-- No vector index: distance is masked and computed in code (section 14), so <-> is not used.

create table briefs (
  site_id    uuid not null references sites(id) on delete cascade,
  input_hash text not null,
  model      text not null,
  text       text not null,
  citations  jsonb not null,
  created_at timestamptz not null default now(),
  primary key (site_id, input_hash)
);
alter table briefs enable row level security;
grant select, insert, update, delete on briefs to service_role;

-- percentile helper: rank of one value among non test sites for a named metric
create or replace function metric_percentile(metric text, value double precision)
returns table (percentile double precision, n bigint) language sql stable as $$
  with vals as (
    select (metrics ->> metric)::double precision as v
    from sites where is_test = false and metrics ? metric
  )
  select
    case when count(*) >= 10
         then (count(*) filter (where v < value))::double precision / count(*)
         else null end,
    count(*)
  from vals;
$$;
revoke execute on function metric_percentile(text, double precision) from public, anon, authenticated;
grant execute on function metric_percentile(text, double precision) to service_role;
