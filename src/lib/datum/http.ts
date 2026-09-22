// Outbound request policy and LayerEnvelope builders.
// SPEC.md section 8. Source modules never throw out of their fetcher: they
// catch SourceError and turn it into an unavailable envelope.

import {
  RETRY_BACKOFF_MS,
  RETRY_STATUSES,
  WALL_CLOCK_CAP_MS,
} from "./constants";
import type {
  LayerEnvelope,
  LayerName,
  LayerSource,
  SourceContext,
  UnavailableCode,
} from "./types";

// ─── Errors ──────────────────────────────────────────────────────────────────

export class SourceError extends Error {
  code: UnavailableCode;
  httpStatus?: number;
  source?: string;

  constructor(
    code: UnavailableCode,
    message: string,
    options?: { httpStatus?: number; source?: string },
  ) {
    super(message);
    this.name = "SourceError";
    this.code = code;
    this.httpStatus = options?.httpStatus;
    this.source = options?.source;
  }
}

export function isSourceError(value: unknown): value is SourceError {
  return value instanceof SourceError;
}

/** Turn anything thrown by a fetcher into a SourceError. */
export function toSourceError(value: unknown, source: string): SourceError {
  if (isSourceError(value)) return value;
  const message = value instanceof Error ? value.message : String(value);
  return new SourceError("upstream_error", message, { source });
}

// ─── fetchWithPolicy ─────────────────────────────────────────────────────────

export interface FetchPolicy {
  timeoutMs: number;
  retries: number;
  retryOn: number[];
  source: string;
}

export interface PolicyResponse {
  status: number;
  url: string;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One outbound request with the Datum User-Agent, an AbortSignal timeout, one
 * retry with a 1.5 s backoff on a timeout or a retryable status, and a 55 s
 * total wall clock cap. Throws SourceError; never returns a failed response.
 */
export async function fetchWithPolicy(
  url: string,
  init: RequestInit,
  policy: FetchPolicy,
  ctx: Pick<SourceContext, "fetch" | "userAgent">,
): Promise<PolicyResponse> {
  const startedAt = Date.now();
  const deadline = startedAt + WALL_CLOCK_CAP_MS;
  const attempts = Math.max(0, policy.retries) + 1;
  let lastError: SourceError | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new SourceError(
        "timeout",
        `${policy.source} exceeded the 55 second request budget.`,
        { source: policy.source },
      );
    }

    const controller = new AbortController();
    const timeoutMs = Math.min(policy.timeoutMs, remaining);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers = new Headers(init.headers);
    headers.set("User-Agent", ctx.userAgent);

    try {
      const response = await ctx.fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const retryable =
        policy.retryOn.includes(response.status) ||
        RETRY_STATUSES.includes(response.status);

      if (response.status >= 400) {
        const error = new SourceError(
          response.status === 429 ? "rate_limited" : "http_error",
          `${policy.source} returned HTTP ${response.status}.`,
          { httpStatus: response.status, source: policy.source },
        );
        if (retryable && attempt < attempts - 1) {
          lastError = error;
          await sleep(RETRY_BACKOFF_MS);
          continue;
        }
        throw error;
      }

      return {
        status: response.status,
        url,
        text: () => response.text(),
        json: () => response.json() as Promise<unknown>,
      };
    } catch (raw) {
      clearTimeout(timer);
      if (isSourceError(raw)) throw raw;
      const aborted =
        raw instanceof Error &&
        (raw.name === "AbortError" || raw.name === "TimeoutError");
      const error = aborted
        ? new SourceError(
            "timeout",
            `${policy.source} did not answer within ${timeoutMs} ms.`,
            { source: policy.source },
          )
        : new SourceError(
            "upstream_error",
            raw instanceof Error ? raw.message : String(raw),
            { source: policy.source },
          );
      if (attempt < attempts - 1 && (aborted || error.code === "upstream_error")) {
        lastError = error;
        await sleep(RETRY_BACKOFF_MS);
        continue;
      }
      throw error;
    }
  }

  throw (
    lastError ??
    new SourceError("upstream_error", `${policy.source} made no attempt.`, {
      source: policy.source,
    })
  );
}

// ─── URL hygiene ─────────────────────────────────────────────────────────────

/**
 * Remove the value of any `key` query parameter. The result is what goes into
 * LayerEnvelope.source.url and the api_cache row (SPEC section 15).
 */
export function stripKey(url: string): string {
  const cut = url.indexOf("?");
  if (cut === -1) return url;
  const base = url.slice(0, cut);
  const params = url.slice(cut + 1).split("&");
  const cleaned = params.map((pair) => {
    const eq = pair.indexOf("=");
    const name = eq === -1 ? pair : pair.slice(0, eq);
    if (name.toLowerCase() === "key") return "key=";
    return pair;
  });
  return `${base}?${cleaned.join("&")}`;
}

// ─── Field paths ─────────────────────────────────────────────────────────────

function walk(value: unknown, prefix: string, out: Set<string>): void {
  if (Array.isArray(value)) {
    const path = `${prefix}[]`;
    if (value.length === 0) {
      out.add(path);
      return;
    }
    for (const item of value) walk(item, path, out);
    return;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      out.add(prefix);
      return;
    }
    for (const [name, child] of entries) {
      walk(child, prefix ? `${prefix}.${name}` : name, out);
    }
    return;
  }
  if (prefix) out.add(prefix);
}

/**
 * Every dotted leaf path in the data object. Arrays collapse to `path[]` rather
 * than an index, so the brief cites `climate.monthly[].meanC`.
 */
export function fieldPathsOf(data: unknown): string[] {
  const out = new Set<string>();
  walk(data, "", out);
  return [...out].sort();
}

// ─── Envelope builders ───────────────────────────────────────────────────────

export interface EnvelopeSource {
  name: string;
  url: string;
  licence: string;
  cached: boolean;
}

export interface EnvelopeOpts {
  /** ctx.now, so tests can pin fetchedAt. Defaults to the wall clock. */
  now?: () => Date;
  /** Override the computed fieldPaths. */
  fieldPaths?: string[];
  httpStatus?: number;
  retryable?: boolean;
}

function buildSource(source: EnvelopeSource, opts?: EnvelopeOpts): LayerSource {
  const now = opts?.now ? opts.now() : new Date();
  return {
    name: source.name,
    url: stripKey(source.url),
    fetchedAt: now.toISOString(),
    cached: source.cached,
    licence: source.licence,
  };
}

export function ok<T>(
  layer: LayerName,
  source: EnvelopeSource,
  data: T,
  opts?: EnvelopeOpts,
): LayerEnvelope<T> {
  return {
    layer,
    status: "ok",
    data,
    source: buildSource(source, opts),
    fieldPaths: opts?.fieldPaths ?? fieldPathsOf(data),
  };
}

export function partial<T>(
  layer: LayerName,
  source: EnvelopeSource,
  data: T,
  missing: string[],
  message: string,
  opts?: EnvelopeOpts,
): LayerEnvelope<T> {
  return {
    layer,
    status: "partial",
    data,
    source: buildSource(source, opts),
    partial: { missing, message },
    fieldPaths: opts?.fieldPaths ?? fieldPathsOf(data),
  };
}

/** Codes that a retry could plausibly clear. */
export function defaultRetryable(
  code: UnavailableCode,
  httpStatus?: number,
): boolean {
  if (code === "no_coverage" || code === "missing_key") return false;
  if (code === "timeout" || code === "rate_limited") return true;
  if (code === "http_error") {
    if (typeof httpStatus !== "number") return false;
    return httpStatus === 429 || httpStatus >= 500;
  }
  if (code === "upstream_error") return true;
  return false;
}

export function unavailable<T>(
  layer: LayerName,
  source: EnvelopeSource,
  code: UnavailableCode,
  message: string,
  opts?: EnvelopeOpts,
): LayerEnvelope<T> {
  const httpStatus = opts?.httpStatus;
  return {
    layer,
    status: "unavailable",
    data: null,
    source: buildSource(source, opts),
    unavailable: {
      code,
      message,
      ...(typeof httpStatus === "number" ? { httpStatus } : {}),
      retryable: opts?.retryable ?? defaultRetryable(code, httpStatus),
    },
    fieldPaths: [],
  };
}
