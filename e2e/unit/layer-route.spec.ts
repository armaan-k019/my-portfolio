import { test, expect } from "@playwright/test";
import { GET } from "../../src/app/api/datum/layers/[layer]/route";
import {
  checkRateLimit,
  clientIpFrom,
  getSiteById,
  hashIp,
  issueLocalSiteId,
  memoryStatus,
  setClientForTests,
} from "../../src/lib/datum/memory";
import { RATE_LIMIT_PER_DAY } from "../../src/lib/datum/constants";

// The route is exercised through plain Request objects. Nothing here starts a
// server, and no upstream is reached: the one test that gets past the guards
// stubs globalThis.fetch, which is what buildSourceContext hands the fetcher.

/** The site key of the Atlanta test point, 33.7751258, -84.391975. */
const ATLANTA_KEY = "33.775,-84.392";
const LOCAL_ID = issueLocalSiteId(ATLANTA_KEY);
const UUID = "11111111-1111-1111-1111-111111111111";

/** A local id whose signature has been altered by one character. */
function forgeSignature(id: string): string {
  const last = id.slice(-1);
  return `${id.slice(0, -1)}${last === "0" ? "1" : "0"}`;
}

function site(id: string): string {
  return `site=${encodeURIComponent(id)}`;
}

function url(layer: string, query: string): string {
  return `https://datum.test/api/datum/layers/${layer}?${query}`;
}

function context(layer: string): { params: Promise<{ layer: string }> } {
  return { params: Promise.resolve({ layer }) };
}

function call(
  layer: string,
  query: string,
  headers?: Record<string, string>,
): Promise<Response> {
  return GET(new Request(url(layer, query), { headers }), context(layer));
}

/** Site Memory online with no client behind it, which is the fresh state. */
function goOnline(): void {
  setClientForTests(null);
}

/**
 * Drive the offline guard the way a paused project does: one operation against
 * a module with no client flips it offline for the cooldown.
 */
async function goOffline(): Promise<void> {
  setClientForTests(null);
  await getSiteById(UUID);
  expect(memoryStatus()).toBe("offline");
}

test("an unknown layer is a 404", async () => {
  const response = await call("moon", `site=${UUID}`);
  expect(response.status).toBe(404);
  const body = (await response.json()) as { error: { code: string } };
  expect(body.error.code).toBe("not_found");
});

test("a missing site is a 400", async () => {
  const response = await call("topo", "layerOnly=1");
  expect(response.status).toBe(400);
  const body = (await response.json()) as { error: { message: string } };
  expect(body.error.message).toContain("site is required");
});

test("a forged local site id is a 400 however memory is feeling", async () => {
  goOnline();
  expect(memoryStatus()).toBe("online");

  // A bad signature.
  const tamperedSig = await call("topo", site(forgeSignature(LOCAL_ID)));
  expect(tamperedSig.status).toBe(400);

  // A tampered site key: the signature still belongs to the Atlanta point.
  const parts = LOCAL_ID.split("-");
  const signature = parts[parts.length - 1];
  const movedPoint = await call("topo", site(`local-25.801,-80.189-${signature}`));
  expect(movedPoint.status).toBe(400);

  // An id invented wholesale, which is what the old prefix only rule allowed.
  const invented = await call("topo", site("local-0123456789abcdef01234567"));
  expect(invented.status).toBe(400);

  // A signature from two days ago: yesterday is honoured, the day before is not.
  const stale = issueLocalSiteId(ATLANTA_KEY, new Date(Date.now() - 2 * 86_400_000));
  expect((await call("topo", site(stale))).status).toBe(400);

  // And the same three while memory is offline.
  await goOffline();
  expect((await call("topo", site(forgeSignature(LOCAL_ID)))).status).toBe(400);
  expect((await call("topo", site("local-0123456789abcdef01234567"))).status).toBe(400);
  expect((await call("topo", site(stale))).status).toBe(400);
});

test("a yesterday signature still resolves, so an analysis can cross midnight", async () => {
  goOnline();
  const yesterday = issueLocalSiteId(ATLANTA_KEY, new Date(Date.now() - 86_400_000));
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("upstream failure", { status: 500 })) as typeof fetch;
  try {
    const response = await call("seismic", site(yesterday));
    expect(response.status).toBe(200);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("an out of range lat or lng is a 400, not a request", async () => {
  await goOffline();
  // The point now travels inside the signed id, so these are ids the site route
  // would never issue: signed, but outside the range it validates on the way in.
  const highLat = await call("topo", site(issueLocalSiteId("91.000,-84.392")));
  expect(highLat.status).toBe(400);
  expect(
    ((await highLat.json()) as { error: { message: string } }).error.message,
  ).toContain("lat");

  const lowLat = await call("topo", site(issueLocalSiteId("-91.000,-84.392")));
  expect(lowLat.status).toBe(400);

  const wideLng = await call("topo", site(issueLocalSiteId("33.775,181.000")));
  expect(wideLng.status).toBe(400);
  expect(
    ((await wideLng.json()) as { error: { message: string } }).error.message,
  ).toContain("lng");
});

test("an invalid seismic site class is a 400 before any upstream call", async () => {
  await goOffline();
  let calls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const response = await call(
      "seismic",
      `${site(LOCAL_ID)}&siteClass=Z`,
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("bad_request");
    expect(calls).toBe(0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a valid local site id is accepted whether memory is offline or online", async () => {
  await goOffline();
  const realFetch = globalThis.fetch;
  // The upstream is refused, so the layer answers unavailable. What matters is
  // that the route dispatched at all rather than rejecting the id.
  globalThis.fetch = (async () =>
    new Response("upstream failure", { status: 500 })) as typeof fetch;
  try {
    const response = await call(
      "seismic",
      site(LOCAL_ID),
      { "x-forwarded-for": "198.51.100.7" },
    );
    expect(response.status).toBe(200);
    const envelope = (await response.json()) as {
      layer: string;
      status: string;
      data: unknown;
    };
    expect(envelope.layer).toBe("seismic");
    expect(envelope.status).toBe("unavailable");
    expect(envelope.data).toBeNull();

    // The cool down expires and memory reports online again mid analysis. The
    // same id must keep working: this is the bug the signature fixes.
    goOnline();
    expect(memoryStatus()).toBe("online");
    const online = await call("seismic", site(LOCAL_ID), {
      "x-forwarded-for": "198.51.100.7",
    });
    expect(online.status).toBe(200);
    expect(((await online.json()) as { layer: string }).layer).toBe("seismic");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a local site id past the daily cap is a 429, not a free upstream call", async () => {
  await goOffline();
  const ip = "203.0.113.42";
  const ipHash = hashIp(clientIpFrom(ip));
  for (let i = 0; i < RATE_LIMIT_PER_DAY + 1; i++) {
    await checkRateLimit(ipHash);
  }

  let calls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const response = await call("seismic", site(LOCAL_ID), {
      "x-forwarded-for": ip,
    });
    expect(response.status).toBe(429);
    const body = (await response.json()) as {
      error: { code: string; resetAt: string };
    };
    expect(body.error.code).toBe("rate_limited");
    expect(body.error.resetAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(calls).toBe(0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("the peek does not spend a request of its own", async () => {
  await goOffline();
  const ipHash = hashIp(clientIpFrom("192.0.2.9"));
  const before = await checkRateLimit(ipHash, { increment: false });

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("upstream failure", { status: 500 })) as typeof fetch;
  try {
    await call("seismic", site(LOCAL_ID), {
      "x-forwarded-for": "192.0.2.9",
    });
  } finally {
    globalThis.fetch = realFetch;
  }

  const after = await checkRateLimit(ipHash, { increment: false });
  expect(after.count).toBe(before.count);
});
