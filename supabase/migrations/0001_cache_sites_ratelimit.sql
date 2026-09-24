create extension if not exists pgcrypto;

create table api_cache (
  cache_key   text primary key,               -- "<source>:<params hash>"
  source      text not null,                  -- overpass, fema, usgs_elev, usgs_seis, usda, census_geo, census_acs, tiger, openmeteo, nominatim, photon
  url         text not null,                  -- key parameter stripped
  http_status int  not null,
  body        jsonb not null,                 -- trimmed payload
  fetched_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index api_cache_expires_idx on api_cache (expires_at);
create index api_cache_source_idx on api_cache (source);

create table sites (
  id               uuid primary key default gen_random_uuid(),
  site_key         text not null unique,      -- "<lat 3dp>,<lng 3dp>" (about 100 m)
  lat              double precision not null, -- confirmed point
  lng              double precision not null,
  public_lat       double precision not null, -- round(lat, 2), about 1 km
  public_lng       double precision not null,
  locality         text,                      -- "Atlanta, Georgia" from Nominatim reverse zoom 10
  tract_geoid      text,
  is_test          boolean not null default false,
  created_at       timestamptz not null default now(),
  last_analyzed_at timestamptz not null default now(),
  analysis_count   int not null default 1,
  schema_version   int not null default 1
);
create index sites_public_idx on sites (public_lat, public_lng) where is_test = false;

create table layer_results (
  site_id     uuid not null references sites(id) on delete cascade,
  layer       text not null,
  status      text not null check (status in ('ok','partial','unavailable')),
  envelope    jsonb not null,                 -- the full LayerEnvelope
  computed_at timestamptz not null default now(),
  expires_at  timestamptz not null,
  primary key (site_id, layer)
);

create table rate_limits (
  ip_hash text not null,                      -- sha256(ip + fixed app salt), hex
  day     date not null,
  count   int  not null default 0,
  primary key (ip_hash, day)
);

alter table api_cache     enable row level security;
alter table sites         enable row level security;
alter table layer_results enable row level security;
alter table rate_limits   enable row level security;

-- The project has "automatically expose new tables" turned off, so grants are explicit.
-- service_role only. Nothing is granted to anon or authenticated.
grant select, insert, update, delete on api_cache, sites, layer_results, rate_limits to service_role;

-- Atomic rate limit increment (owner decision, 2026-09-24). PostgREST cannot express
-- "count = count + 1" in an upsert, so the increment lives in SQL. service_role only.
create or replace function rate_limit_hit(p_ip_hash text, p_day date)
returns int language sql as $$
  insert into rate_limits (ip_hash, day, count) values (p_ip_hash, p_day, 1)
  on conflict (ip_hash, day) do update set count = rate_limits.count + 1
  returning count;
$$;
revoke execute on function rate_limit_hit(text, date) from public, anon, authenticated;
grant execute on function rate_limit_hit(text, date) to service_role;
