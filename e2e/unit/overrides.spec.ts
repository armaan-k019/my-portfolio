// DATUM_SOURCE_OVERRIDES: owner decision 6 of 2026-09-24, SPEC section 15.
// The map is honoured only when DATUM_ALLOW_TEST_FLAG is "1" and NODE_ENV is
// not "production". Both conditions, so a production build ignores it whatever
// the flag says. The alias table also carries an "overpass" override onto the
// mirror, which is the hole the forced failure run fell through on 2026-09-24.

import { test, expect } from "@playwright/test";
import { buildSourceContext } from "../../src/lib/datum/layers";
import { SOURCE_BASE_URLS, resolveBaseUrl } from "../../src/lib/datum/constants";

const UNREACHABLE = "http://127.0.0.1:9";

/** process.env is typed narrowly for NODE_ENV, and these tests set it. */
const env = process.env as Record<string, string | undefined>;

interface EnvSnapshot {
  nodeEnv: string | undefined;
  flag: string | undefined;
  overrides: string | undefined;
}

function snapshot(): EnvSnapshot {
  return {
    nodeEnv: env.NODE_ENV,
    flag: env.DATUM_ALLOW_TEST_FLAG,
    overrides: env.DATUM_SOURCE_OVERRIDES,
  };
}

function restore(saved: EnvSnapshot): void {
  env.NODE_ENV = saved.nodeEnv;
  env.DATUM_ALLOW_TEST_FLAG = saved.flag;
  env.DATUM_SOURCE_OVERRIDES = saved.overrides;
}

function setEnv(nodeEnv: string, flag: string | undefined, overrides: string): void {
  env.NODE_ENV = nodeEnv;
  if (flag === undefined) delete env.DATUM_ALLOW_TEST_FLAG;
  else env.DATUM_ALLOW_TEST_FLAG = flag;
  env.DATUM_SOURCE_OVERRIDES = overrides;
}

test("the override map is inert in production even with the test flag set", async () => {
  const saved = snapshot();
  try {
    setEnv("production", "1", JSON.stringify({ openmeteo: UNREACHABLE }));
    const ctx = buildSourceContext();
    expect(ctx.overrides).toEqual({});
    expect(resolveBaseUrl("openmeteo", ctx)).toBe(SOURCE_BASE_URLS.openmeteo);
  } finally {
    restore(saved);
  }
});

test("the override map applies outside production when the test flag is set", async () => {
  const saved = snapshot();
  try {
    setEnv("test", "1", JSON.stringify({ openmeteo: UNREACHABLE }));
    const ctx = buildSourceContext();
    expect(ctx.overrides).toEqual({ openmeteo: UNREACHABLE });
    expect(resolveBaseUrl("openmeteo", ctx)).toBe(UNREACHABLE);
  } finally {
    restore(saved);
  }
});

test("without the test flag the override map is ignored outside production too", async () => {
  const saved = snapshot();
  try {
    setEnv("test", undefined, JSON.stringify({ openmeteo: UNREACHABLE }));
    const ctx = buildSourceContext();
    expect(ctx.overrides).toEqual({});
    expect(resolveBaseUrl("openmeteo", ctx)).toBe(SOURCE_BASE_URLS.openmeteo);
  } finally {
    restore(saved);
  }
});

test("an overpass override covers the primary host and the mirror", async () => {
  const saved = snapshot();
  try {
    setEnv("test", "1", JSON.stringify({ overpass: UNREACHABLE }));
    const ctx = buildSourceContext();
    // The direct key answers for overpass, the alias entry for the mirror, and
    // neither path falls through to the real host.
    expect(resolveBaseUrl("overpass", ctx)).toBe(UNREACHABLE);
    expect(resolveBaseUrl("overpass_mirror", ctx)).toBe(UNREACHABLE);
    expect(SOURCE_BASE_URLS.overpass).not.toBe(SOURCE_BASE_URLS.overpass_mirror);
  } finally {
    restore(saved);
  }
});

test("an unrelated source keeps its real base url under an overpass override", async () => {
  const saved = snapshot();
  try {
    setEnv("test", "1", JSON.stringify({ overpass: UNREACHABLE }));
    const ctx = buildSourceContext();
    expect(resolveBaseUrl("usgs_seismic", ctx)).toBe(SOURCE_BASE_URLS.usgs_seismic);
    expect(resolveBaseUrl("nominatim", ctx)).toBe(SOURCE_BASE_URLS.nominatim);
  } finally {
    restore(saved);
  }
});
