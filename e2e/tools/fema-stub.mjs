// A local stand in for the FEMA NFHL MapServer, for test runs only.
//
// hazards.fema.gov has refused connections from this machine since 2026-09-22
// (e2e/fixtures/fema/UNREACHABLE.txt), so the Miami VE cross hatch and the
// WaKeeney no coverage stamp had never been seen rendered. This server answers
// the two queries src/lib/datum/sources/fema.ts makes, layer 0 at the point and
// layer 28 at the point and over the 800 m envelope, from the labelled fixture
// files in e2e/fixtures/fema and from nothing else.
//
// Every file it serves is CONSTRUCTED, NOT CAPTURED, and says so in its own
// "_constructed" key. Anything this server is asked for that has no fixture is
// a 404 with a note, never an invented answer.
//
//   node e2e/tools/fema-stub.mjs [--port 8787]
//
// Point the app at it with DATUM_SOURCE_OVERRIDES='{"fema":"http://127.0.0.1:8787"}'
// on a dev server with DATUM_ALLOW_TEST_FLAG=1. Overrides are inert in a
// production build by design (SPEC section 15).

import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, "..", "fixtures", "fema");

/** The three test sites of SPEC section 5, with the fixtures each one has. */
const SITES = [
  { slug: "miami", lat: 25.8011588, lng: -80.1890627 },
  { slug: "atlanta", lat: 33.7751258, lng: -84.391975 },
  { slug: "wakeeney", lat: 39.019769, lng: -99.883731 },
];

/** How far a query point may sit from a test site and still be that site. */
const MATCH_DEGREES = 0.01;

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const PORT = Number(
  portIndex >= 0 ? args[portIndex + 1] : process.env.DATUM_FEMA_STUB_PORT || 8787,
);

function siteFor(lat, lng) {
  for (const site of SITES) {
    if (
      Math.abs(site.lat - lat) <= MATCH_DEGREES &&
      Math.abs(site.lng - lng) <= MATCH_DEGREES
    ) {
      return site;
    }
  }
  return null;
}

/**
 * The fixture basename for one request, or null when there is none. The name
 * carries the site, the layer, and whether the geometry was a point or an
 * envelope, which is exactly how the files are labelled.
 */
function fixtureFor(layer, shape, site) {
  if (layer === "0" && shape === "point") return `${site.slug}-layer0`;
  if (layer === "28" && shape === "point") return `${site.slug}-layer28-point`;
  if (layer === "28" && shape === "envelope") return `${site.slug}-layer28-envelope`;
  return null;
}

function notFound(response, why) {
  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ stub: "datum fema stub", served: false, why }));
}

const server = createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
  const match = /\/(\d+)\/query$/.exec(url.pathname);
  if (!match) {
    notFound(response, `no NFHL layer in the path ${url.pathname}`);
    return;
  }
  const layer = match[1];

  const geometry = (url.searchParams.get("geometry") ?? "")
    .split(",")
    .map((part) => Number(part));
  if (geometry.some((value) => !Number.isFinite(value))) {
    notFound(response, "the geometry parameter is not a list of numbers");
    return;
  }

  let shape = null;
  let lat = NaN;
  let lng = NaN;
  if (geometry.length === 2) {
    shape = "point";
    [lng, lat] = geometry;
  } else if (geometry.length === 4) {
    shape = "envelope";
    lng = (geometry[0] + geometry[2]) / 2;
    lat = (geometry[1] + geometry[3]) / 2;
  } else {
    notFound(response, `a geometry of ${geometry.length} numbers is neither a point nor an envelope`);
    return;
  }

  const site = siteFor(lat, lng);
  if (!site) {
    notFound(response, `no labelled fixture for ${lat.toFixed(6)},${lng.toFixed(6)}`);
    return;
  }
  const name = fixtureFor(layer, shape, site);
  const file = name === null ? null : path.join(FIXTURES, `${name}.json`);
  if (file === null || !existsSync(file)) {
    notFound(
      response,
      `no fixture file for ${site.slug} layer ${layer} ${shape}; nothing is invented here`,
    );
    console.error(`[fema-stub] 404 ${site.slug} layer ${layer} ${shape}`);
    return;
  }

  const body = readFileSync(file, "utf8");
  console.error(`[fema-stub] 200 ${site.slug} layer ${layer} ${shape} from ${name}.json`);
  response.writeHead(200, {
    "content-type": "application/json",
    "x-datum-stub-fixture": `${name}.json`,
  });
  response.end(body);
});

server.listen(PORT, "127.0.0.1", () => {
  console.error(
    `[fema-stub] listening on http://127.0.0.1:${PORT}, serving CONSTRUCTED fixtures from e2e/fixtures/fema`,
  );
});
