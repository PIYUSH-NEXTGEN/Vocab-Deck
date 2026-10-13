/**
 * Typed API client for the FastAPI vocabulary service.
 *
 * - Base URL: VITE_API_URL, defaulting to the same-origin /api prefix
 *   (proxied to the backend in dev).
 * - Errors are parsed into ApiError with the server's error code when available.
 * - DTO responses are mapped to the camelCase domain types used by the UI.
 */

import type {
  DeckListResponseDto,
  DeckSummary,
  DeckSummaryDto,
  EntryPage,
  EntryPageDto,
  VocabularyEntry,
  VocabularyEntryDto,
} from "./types";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

const DEFAULT_BASE_URL = "/api";
const REQUEST_TIMEOUT_MS = 10_000;

function baseUrl(): string {
  const raw = import.meta.env.VITE_API_URL as string | undefined;
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 ? trimmed.replace(/\/+$/, "") : DEFAULT_BASE_URL;
}

interface ErrorBody {
  error?: { code?: string; message?: string };
  /** FastAPI's default error shape from a server that is NOT this service. */
  detail?: unknown;
}

async function readErrorBody(response: Response): Promise<ErrorBody | null> {
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === "object") return parsed as ErrorBody;
    return null;
  } catch {
    return null;
  }
}

/** How to point the app at a running backend (shared by every setup error). */
const BACKEND_HINT = "Start the backend (cd backend && uvicorn app.main:app --port 8000) or set VITE_API_URL.";

/**
 * Explain a response that did not come from this service (foreign server on the
 * same port, a static file server returning HTML, a wrong VITE_API_URL, ...).
 */
function foreignServerMessage(status: number, body: ErrorBody | null): string {
  if (body && "detail" in body) {
    return (
      `The server at ${baseUrl()} is not the Vocab Deck API ` +
      `(it replied ${status}: ${JSON.stringify(body.detail)}). ` +
      BACKEND_HINT
    );
  }
  return (
    `The server at ${baseUrl()} did not return a vocabulary API response (status ${status}). ` +
    BACKEND_HINT
  );
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (cause) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (controller.signal.aborted) {
      throw new ApiError("timeout", "The vocabulary service did not respond in time.", 0);
    }
    throw new ApiError(
      "network_error",
      `Could not reach the vocabulary service (${(cause as Error)?.message ?? "unknown error"}).`,
      0,
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }

  if (!response.ok) {
    const body = await readErrorBody(response);
    if (body?.error?.code || body?.error?.message) {
      throw new ApiError(
        body.error.code ?? "http_error",
        body.error.message ?? `Request failed with status ${response.status}.`,
        response.status,
      );
    }
    throw new ApiError("unexpected_response", foreignServerMessage(response.status, body), response.status);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(
      "unexpected_response",
      `The server at ${baseUrl()} did not return a vocabulary API response (unreadable body). ` +
        BACKEND_HINT,
      response.status,
    );
  }
}

/* ---------- DTO -> domain mapping ---------- */

export function toVocabularyEntry(dto: VocabularyEntryDto): VocabularyEntry {
  return {
    id: dto.id,
    source: dto.source,
    target: dto.target,
    alternatives: [...dto.alternatives],
    tags: [...dto.tags],
  };
}

export function toDeckSummary(dto: DeckSummaryDto): DeckSummary {
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description,
    sourceLanguage: dto.source_language,
    targetLanguage: dto.target_language,
    entryCount: dto.entry_count,
  };
}

/* ---------- Endpoints ---------- */

/**
 * Tiny read-through cache for GET endpoints. Every page mount refetches
 * otherwise, so navigating Home <-> Library pays a full server round trip
 * (including a serverless cold start in deployment) each time. Entries live
 * for DECKS_TTL_MS; only successes are cached, so errors and retries always
 * hit the network.
 *
 * Deliberately NOT sharing in-flight requests: each caller keeps its own
 * fetch tied to its own abort signal. Sharing one promise across callers
 * lets one component's unmount abort poison the others with a stale
 * "Aborted" rejection (StrictMode remounts, fast navigation).
 */
const DECKS_TTL_MS = 5 * 60_000;
const cache = new Map<string, { data: unknown; at: number }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < DECKS_TTL_MS) return hit.data as T;
  const data = await load();
  cache.set(key, { data, at: Date.now() });
  return data;
}

/** Clears the endpoint cache (tests; logout-style resets if ever needed). */
export function clearApiCache(): void {
  cache.clear();
}

export async function listDecks(signal?: AbortSignal): Promise<DeckSummary[]> {
  return cached("decks", async () => {
    const data = await request<DeckListResponseDto>("/decks", signal);
    return data.decks.map(toDeckSummary);
  });
}

export async function getDeck(deckId: string, signal?: AbortSignal): Promise<DeckSummary> {
  return cached(`deck:${deckId}`, async () => {
    return toDeckSummary(
      await request<DeckSummaryDto>(`/decks/${encodeURIComponent(deckId)}`, signal),
    );
  });
}

export async function getEntries(
  deckId: string,
  params: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<EntryPage> {
  const query = new URLSearchParams();
  if (params.limit != null) query.set("limit", String(params.limit));
  if (params.offset != null) query.set("offset", String(params.offset));
  const suffix = query.toString() ? `?${query}` : "";
  const path = `/decks/${encodeURIComponent(deckId)}/entries${suffix}`;
  return cached(`entries:${path}`, async () => {
    const data = await request<EntryPageDto>(path, signal);
    return {
      entries: data.entries.map(toVocabularyEntry),
      total: data.total,
      limit: data.limit,
      offset: data.offset,
    };
  });
}

/** Type-safe narrowing for error branches. */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
