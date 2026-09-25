create extension if not exists vector with schema extensions;

alter table sites
  add column metrics        jsonb,                      -- named, unnormalized values
  add column metrics_vector extensions.vector(14),      -- normalized 0..1, see section 14
  add column metrics_at     timestamptz;

create index sites_metrics_vector_idx on sites
  using hnsw (metrics_vector extensions.vector_l2_ops)
  where is_test = false and metrics_vector is not null;

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
