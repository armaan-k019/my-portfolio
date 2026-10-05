// USGS ASCE 7-22 seismic design values.
// SPEC.md section 9 "seismic", PHASE-1-data.md step 1.5.

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
import type { LayerFetcher, SeismicData } from "../types";

export const SITE_CLASSES = ["A", "B", "C", "D", "E"];
export const DEFAULT_SITE_CLASS = "D";
export const RISK_CATEGORY = "II";
export const REFERENCE_DOCUMENT = "ASCE 7-22";

/** Anything outside A to E is rejected before the request (PHASE-1 step 1.5). */
export function isValidSiteClass(value: string): boolean {
  return SITE_CLASSES.includes(value.toUpperCase());
}

/** The nine values the sheet prints, as they arrive from response.data. */
interface SeismicRaw {
  ss: unknown;
  s1: unknown;
  sms: unknown;
  sm1: unknown;
  sds: unknown;
  sd1: unknown;
  sdc: unknown;
  pgam: unknown;
  tl: unknown;
}

const NUMERIC_FIELDS = ["ss", "s1", "sms", "sm1", "sds", "sd1", "pgam", "tl"];

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function trim(raw: unknown): SeismicRaw {
  if (!raw || typeof raw !== "object") {
    throw new SourceError(
      "parse_error",
      "USGS seismic returned a body that is not an object.",
    );
  }
  const envelope = raw as { response?: { data?: unknown } };
  const data = envelope.response?.data;
  if (!data || typeof data !== "object") {
    throw new SourceError(
      "parse_error",
      "USGS seismic returned no response.data object.",
    );
  }
  const source = data as Record<string, unknown>;
  return {
    ss: source.ss,
    s1: source.s1,
    sms: source.sms,
    sm1: source.sm1,
    sds: source.sds,
    sd1: source.sd1,
    sdc: source.sdc,
    pgam: source.pgam,
    tl: source.tl,
  };
}

function parseSeismic(
  trimmed: SeismicRaw,
  siteClass: string,
  siteClassIsDefault: boolean,
): { data: SeismicData; missing: string[] } {
  const values: Record<string, number | null> = {};
  const missing: string[] = [];
  for (const field of NUMERIC_FIELDS) {
    const value = numberOrNull((trimmed as unknown as Record<string, unknown>)[field]);
    values[field] = value;
    if (value === null) missing.push(field);
  }
  const sdc = typeof trimmed.sdc === "string" && trimmed.sdc.length > 0 ? trimmed.sdc : null;
  if (sdc === null) missing.push("sdc");

  return {
    data: {
      ss: values.ss,
      s1: values.s1,
      sms: values.sms,
      sm1: values.sm1,
      sds: values.sds,
      sd1: values.sd1,
      sdc,
      pgam: values.pgam,
      tl: values.tl,
      assumptions: {
        reference: REFERENCE_DOCUMENT,
        riskCategory: RISK_CATEGORY,
        siteClass,
        siteClassIsDefault,
      },
    },
    missing,
  };
}

export const fetchSeismic: LayerFetcher<SeismicData> = async (input, ctx) => {
  const requested = input.params.siteClass;
  const siteClassIsDefault =
    typeof requested !== "string" || requested.trim().length === 0;
  const siteClass = siteClassIsDefault
    ? DEFAULT_SITE_CLASS
    : requested.trim().toUpperCase();

  const base = resolveBaseUrl("usgs_seismic", ctx);
  const url =
    `${base}?latitude=${input.lat}&longitude=${input.lng}` +
    `&riskCategory=${RISK_CATEGORY}&siteClass=${siteClass}&title=Datum`;

  const source = {
    name: SOURCE_DISPLAY_NAMES.usgs_seismic,
    url,
    licence: SOURCE_LICENCES.usgs_seismic,
    cached: false,
  };

  // An unsupported site class is rejected before the request, not sent upstream.
  if (!siteClassIsDefault && !isValidSiteClass(siteClass)) {
    return unavailable(
      "seismic",
      source,
      "http_error",
      withCode(UNAVAILABLE_MESSAGES.usgsSeismic, "http_error"),
      { now: ctx.now, httpStatus: 400, retryable: false },
    );
  }

  const key = `usgs_seismic:${roundKey(input.lat, input.lng, 3)}:${siteClass}`;

  try {
    const result = await cached(
      key,
      TTL_SECONDS.usgsSeismic,
      async () => {
        const response = await fetchWithPolicy(
          url,
          { method: "GET" },
          {
            timeoutMs: SOURCE_TIMEOUT_MS.usgs_seismic,
            retries: 1,
            retryOn: [502, 503, 504],
            source: "usgs_seismic",
          },
          ctx,
        );
        const body = await response.json();
        // Trim before caching: the raw response carries six spectra we never use.
        return {
          source: "usgs_seismic",
          url,
          status: response.status,
          body: trim(body),
          cacheable: true,
        };
      },
      ctx,
    );

    source.cached = result.cached;

    const { data, missing } = parseSeismic(
      result.entry.body as SeismicRaw,
      siteClass,
      siteClassIsDefault,
    );
    if (missing.length > 0) {
      return partial(
        "seismic",
        source,
        data,
        missing,
        "USGS answered but left some design values empty.",
        { now: ctx.now },
      );
    }
    return ok("seismic", source, data, { now: ctx.now });
  } catch (raw) {
    const error = toSourceError(raw, "usgs_seismic");
    return unavailable(
      "seismic",
      source,
      error.code,
      withCode(UNAVAILABLE_MESSAGES.usgsSeismic, error.code),
      { now: ctx.now, httpStatus: error.httpStatus },
    );
  }
};
