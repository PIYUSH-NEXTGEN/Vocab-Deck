import { afterEach, describe, expect, test, vi } from "vitest";
import { clearApiCache, getDeck, getEntries, listDecks } from "../api/client";

const SUMMARY = {
  id: "en-fr",
  name: "French",
  description: "",
  source_language: "en",
  target_language: "fr",
  entry_count: 1,
};

function stubJson(payload: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

function deckListPayload() {
  return { decks: [SUMMARY], total: 1 };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("api endpoint cache", () => {
  test("repeat listDecks calls share one request", async () => {
    const fetchMock = stubJson(deckListPayload());
    const first = await listDecks();
    const second = await listDecks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  test("concurrent mounts share one in-flight request", async () => {
    const fetchMock = stubJson(deckListPayload());
    const [a, b] = await Promise.all([listDecks(), listDecks()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  test("entries are cached per deck and params", async () => {
    const fetchMock = stubJson({ entries: [], total: 0, limit: null, offset: 0 });
    await getEntries("en-fr");
    await getEntries("en-fr");
    await getEntries("en-de");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("getDeck is cached per deck id", async () => {
    const fetchMock = stubJson(SUMMARY);
    await getDeck("en-fr");
    await getDeck("en-fr");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("entries expire after the TTL", async () => {
    vi.useFakeTimers();
    const fetchMock = stubJson(deckListPayload());
    await listDecks();
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    await listDecks();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("failures are not cached: a retry hits the network", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("down"))
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(deckListPayload()), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      );
    await expect(listDecks()).rejects.toThrow();
    const decks = await listDecks();
    expect(decks).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("clearApiCache forces a refetch", async () => {
    const fetchMock = stubJson(deckListPayload());
    await listDecks();
    clearApiCache();
    await listDecks();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
