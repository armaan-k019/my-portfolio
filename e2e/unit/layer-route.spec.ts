import { test, expect } from "@playwright/test";
import { GET } from "../../src/app/api/datum/layers/[layer]/route";
import {
  checkRateLimit,
  clientIpFrom,
  getSiteById,
  hashIp,
  memoryStatus,
  setClientForTests,
} from "../../src/lib/datum/memory";
import { RATE_LIMIT_PER_DAY } from "../../src/lib/datum/constants";

// The route is exercised through plain Request objects. Nothing here starts a
// server, and no upstream is reached: the one test that gets past the guards
// stubs globalThis.fetch, which is what buildSourceContext hands the fetcher.

const ATLANTA = { lat: 33.7751258, lng: -84.391975 };
const LOCAL_ID = "local-0123456789abcdef01234567";
const UUID = "11111111-1111-1111-1111-111111111111";

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

const POINT = `lat=${ATLANTA.lat}&lng=${ATLANTA.lng}`;

test("an unknown layer is a 404", async () => {
  const response = await call("moon", `site=${UUID}`);
  expect(response.status).toBe(404);
  const body = (await response.json()) as { error: { code: string } };
  expect(body.error.code).toBe("not_found");
});

test("a missing site is a 400", async () => {
  const response = await call("topo", "lat=33.77&lng=-84.39");
  expect(response.status).toBe(400);
  const body = (await response.json()) as { error: { message: string } };
  expect(body.error.message).toContain("site is required");
});

test("a local site id is refused while Site Memory is online", async () => {
  goOnline();
  expect(memoryStatus()).toBe("online");
  const response = await call("topo", `site=${LOCAL_ID}&${POINT}`);
  expect(response.status).toBe(400);
});

test("an out of range lat or lng is a 400, not a request", async () => {
  await goOffline();

  const highLat = await call("topo", `site=${LOCAL_ID}&lat=91&lng=-84.39`);
  expect(highLat.status).toBe(400);
  expect(
    ((await highLat.json()) as { error: { message: string } }).error.message,
  ).toContain("lat");

  const lowLat = await call("topo", `site=${LOCAL_ID}&lat=-91&lng=-84.39`);
  expect(lowLat.status).toBe(400);

  const wideLng = await call("topo", `site=${LOCAL_ID}&lat=33.77&lng=181`);
  expect(wideLng.status).toBe(400);
  expect(
    ((await wideLng.json()) as { error: { message: string } }).error.message,
  ).toContain("lng");

  // An absent point is not the origin: Number(null) is 0, so this must be a 400.
  const missing = await call("topo", `site=${LOCAL_ID}`);
  expect(missing.status).toBe(400);

  const blank = await call("topo", `site=${LOCAL_ID}&lat=&lng=`);
  expect(blank.status).toBe(400);
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
      `site=${LOCAL_ID}&${POINT}&siteClass=Z`,
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("bad_request");
    expect(calls).toBe(0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a local site id is accepted while Site Memory is offline", async () => {
  await goOffline();
  const realFetch = globalThis.fetch;
  // The upstream is refused, so the layer answers unavailable. What matters is
  // that the route dispatched at all rather than rejecting the id.
  globalThis.fetch = (async () =>
    new Response("upstream failure", { status: 500 })) as typeof fetch;
  try {
    const response = await call(
      "seismic",
      `site=${LOCAL_ID}&${POINT}`,
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
    const response = await call("seismic", `site=${LOCAL_ID}&${POINT}`, {
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
    await call("seismic", `site=${LOCAL_ID}&${POINT}`, {
      "x-forwarded-for": "192.0.2.9",
    });
  } finally {
    globalThis.fetch = realFetch;
  }

  const after = await checkRateLimit(ipHash, { increment: false });
  expect(after.count).toBe(before.count);
});
