// USDA Soil Data Access (SSURGO) tabular query.
// SPEC.md section 9 "soil", PHASE-1-data.md step 1.5.

import {
  SOURCE_DISPLAY_NAMES,
  SOURCE_LICENCES,
  SOURCE_TIMEOUT_MS,
  TTL_SECONDS,
  UNAVAILABLE_MESSAGES,
  resolveBaseUrl,
  withCode,
} from "../constants";
import { cached } from "../cache";
import { SourceError, fetchWithPolicy, ok, partial, toSourceError, unavailable } from "../http";
import { roundKey } from "../geo";
import type { LayerFetcher, SoilComponent, SoilData } from "../types";

/** The response format SDA returns: row 0 is the column names. */
export const SDA_FORMAT = "JSON+COLUMNNAME";

/** Decimal places for the WKT point. Nothing else in the SQL is variable. */
const COORD_DECIMALS = 6;

/**
 * The SDA query from SPEC section 9. The only variable text is the pair of
 * numbers in the WKT point, each formatted to 6 decimals, so no user text can
 * reach the SQL string.
 */
export function soilQuery(lat: number, lng: number): string {
  const x = Number(lng).toFixed(COORD_DECIMALS);
  const y = Number(lat).toFixed(COORD_DECIMALS);
  return (
    "SELECT TOP 5 mu.muname, mu.mukey, c.compname, c.comppct_r, c.hydgrp, " +
    "c.drainagecl, c.taxorder, c.slope_r, c.hydricrating " +
    `FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(${x} ${y})') AS i ` +
    "INNER JOIN mapunit AS mu ON mu.mukey = i.mukey " +
    "INNER JOIN component AS c ON c.mukey = mu.mukey " +
    "ORDER BY c.comppct_r DESC"
  );
}

type SdaRow = Array<string | null>;

/** The trimmed payload: the SDA Table rows, header row included. */
interface SoilTrimmed {
  table: SdaRow[];
}

function textOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function numberOrNull(value: string | null | undefined): number | null {
  const text = textOrNull(value);
  if (text === null) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Pull the SDA Table out of a response body. A body with no Table is empty. */
export function trimSoil(raw: unknown): SoilTrimmed {
  if (!raw || typeof raw !== "object") {
    throw new SourceError(
      "parse_error",
      "USDA Soil Data Access returned a body that is not an object.",
    );
  }
  const table = (raw as { Table?: unknown }).Table;
  if (table === undefined || table === null) return { table: [] };
  if (!Array.isArray(table)) {
    throw new SourceError(
      "parse_error",
      "USDA Soil Data Access returned a Table that is not an array.",
    );
  }
  const rows: SdaRow[] = [];
  for (const row of table) {
    if (!Array.isArray(row)) continue;
    rows.push(row.map((cell) => (typeof cell === "string" ? cell : null)));
  }
  return { table: rows };
}

/** True when SDA answered but no map unit intersects the point. */
export function isEmptyTable(trimmed: SoilTrimmed): boolean {
  return trimmed.table.length < 2;
}

/**
 * Read the map unit and its components out of the trimmed table. A table with
 * no map unit name or mukey is a parse error, not a silent default.
 */
export function parseSoil(trimmed: SoilTrimmed): {
  data: SoilData;
  missing: string[];
} {
  const [header, ...rows] = trimmed.table;
  const index: Record<string, number> = {};
  header.forEach((name, position) => {
    if (typeof name === "string") index[name] = position;
  });
  const cell = (row: SdaRow, name: string): string | null => {
    const position = index[name];
    return position === undefined ? null : textOrNull(row[position]);
  };

  const mapUnitName = cell(rows[0], "muname");
  const mukey = cell(rows[0], "mukey");
  if (mapUnitName === null || mukey === null) {
    throw new SourceError(
      "parse_error",
      "USDA Soil Data Access returned a row with no map unit name or mukey.",
    );
  }

  const missing: string[] = [];
  const components: SoilComponent[] = [];
  rows.forEach((row, position) => {
    const name = cell(row, "compname");
    if (name === null) {
      missing.push(`components[${position}].name`);
      return;
    }
    components.push({
      name,
      percent: numberOrNull(cell(row, "comppct_r")),
      hydrologicGroup: cell(row, "hydgrp"),
      drainageClass: cell(row, "drainagecl"),
      taxOrder: cell(row, "taxorder"),
      slopePct: numberOrNull(cell(row, "slope_r")),
      hydric: cell(row, "hydricrating"),
    });
  });

  return { data: { mapUnitName, mukey, components }, missing };
}

export const fetchSoil: LayerFetcher<SoilData> = async (input, ctx) => {
  const url = resolveBaseUrl("usda", ctx);
  const query = soilQuery(input.lat, input.lng);

  const source = {
    name: SOURCE_DISPLAY_NAMES.usda,
    url,
    licence: SOURCE_LICENCES.usda,
    cached: false,
  };

  const key = `usda:${roundKey(input.lat, input.lng, 3)}`;

  try {
    const result = await cached(
      key,
      TTL_SECONDS.usda,
      async () => {
        const response = await fetchWithPolicy(
          url,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, format: SDA_FORMAT }),
          },
          {
            timeoutMs: SOURCE_TIMEOUT_MS.usda,
            retries: 1,
            retryOn: [502, 503, 504],
            source: "usda",
          },
          ctx,
        );
        const body = await response.json();
        return {
          source: "usda",
          url,
          status: response.status,
          // Trim before caching, and cache no_coverage with the same TTL.
          body: trimSoil(body),
          cacheable: true,
        };
      },
      ctx,
    );

    source.cached = result.cached;

    const trimmed = result.entry.body as SoilTrimmed;
    if (isEmptyTable(trimmed)) {
      return unavailable(
        "soil",
        source,
        "no_coverage",
        UNAVAILABLE_MESSAGES.usdaNoCoverage,
        { now: ctx.now },
      );
    }

    // "Urban land" with a null hydrologic group is a valid answer, not a failure.
    const { data, missing } = parseSoil(trimmed);
    if (missing.length > 0) {
      return partial(
        "soil",
        source,
        data,
        missing,
        "USDA answered but left some component names empty.",
        { now: ctx.now },
      );
    }
    return ok("soil", source, data, { now: ctx.now });
  } catch (raw) {
    const error = toSourceError(raw, "usda");
    return unavailable(
      "soil",
      source,
      error.code,
      withCode(UNAVAILABLE_MESSAGES.usda, error.code),
      { now: ctx.now, httpStatus: error.httpStatus },
    );
  }
};
