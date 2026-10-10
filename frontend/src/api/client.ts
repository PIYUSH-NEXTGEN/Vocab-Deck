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
}

async function readErrorBody(response: Response): Promise<ErrorBody | null> {
  try {
    return (await response.json()) as ErrorBody;
  } catch {
    return null;
  }
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
    throw new ApiError(
      body?.error?.code ?? "http_error",
      body?.error?.message ?? `Request failed with status ${response.status}.`,
      response.status,
    );
  }
  return (await response.json()) as T;
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

export async function listDecks(signal?: AbortSignal): Promise<DeckSummary[]> {
  const data = await request<DeckListResponseDto>("/decks", signal);
  return data.decks.map(toDeckSummary);
}

export async function getDeck(deckId: string, signal?: AbortSignal): Promise<DeckSummary> {
  return toDeckSummary(await request<DeckSummaryDto>(`/decks/${encodeURIComponent(deckId)}`, signal));
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
  const data = await request<EntryPageDto>(
    `/decks/${encodeURIComponent(deckId)}/entries${suffix}`,
    signal,
  );
  return {
    entries: data.entries.map(toVocabularyEntry),
    total: data.total,
    limit: data.limit,
    offset: data.offset,
  };
}

/** Type-safe narrowing for error branches. */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
