import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Provider } from "@/db/types";
import { extractErrorMessage, verifyApiKey } from "@/lib/ai/model-verify";

function makeJsonResponse(body: unknown, status: number, statusText = "OK"): Response {
  return new Response(JSON.stringify(body), { status, statusText });
}

function makeTextResponse(body: string, status: number, statusText = "OK"): Response {
  return new Response(body, { status, statusText });
}

function makeProvider(type: Provider["type"], overrides: Partial<Provider> = {}): Provider {
  return {
    id: "p1",
    name: "Test",
    type,
    api_key: "test-api-key",
    base_url: "",
    enabled: 1,
    config: undefined,
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
    ...overrides,
  };
}

describe("extractErrorMessage", () => {
  it("returns error.message when body has an error object", async () => {
    const res = makeJsonResponse({ error: { message: "Invalid API key" } }, 401, "Unauthorized");
    expect(await extractErrorMessage(res)).toBe("Invalid API key");
  });

  it("returns top-level message field when no error object", async () => {
    const res = makeJsonResponse({ message: "Not found" }, 404, "Not Found");
    expect(await extractErrorMessage(res)).toBe("Not found");
  });

  it("returns statusText when body is not valid JSON", async () => {
    const res = makeTextResponse("plain text error", 500, "Internal Server Error");
    expect(await extractErrorMessage(res)).toBe("Internal Server Error");
  });

  it("falls back to HTTP status when statusText is empty and body not JSON", async () => {
    const res = new Response("bad gateway", { status: 502, statusText: "" });
    const result = await extractErrorMessage(res);
    expect(result).toBe("HTTP 502");
  });

  it("returns statusText when JSON body has neither error nor message", async () => {
    const res = makeJsonResponse({ data: "something", code: 200 }, 200, "OK");
    expect(await extractErrorMessage(res)).toBe("OK");
  });

  it("prefers error.message over top-level message", async () => {
    const res = makeJsonResponse(
      { error: { message: "nested error" }, message: "top level" },
      401,
      "Unauthorized",
    );
    expect(await extractErrorMessage(res)).toBe("nested error");
  });
});

describe("verifyApiKey", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("anthropic", () => {
    it("resolves without throwing on 200", async () => {
      fetchMock.mockResolvedValue(makeJsonResponse({ type: "error" }, 200));
      const provider = makeProvider("anthropic", { base_url: "https://api.anthropic.com" });
      await expect(verifyApiKey(provider)).resolves.toBeUndefined();
    });

    it("throws 'Invalid API key' on 401", async () => {
      fetchMock.mockResolvedValue(
        makeJsonResponse({ error: { message: "Unauthorized" } }, 401, "Unauthorized"),
      );
      const provider = makeProvider("anthropic", { base_url: "https://api.anthropic.com" });
      await expect(verifyApiKey(provider)).rejects.toThrow("Invalid API key");
    });

    it("throws 'Invalid API key' on 403", async () => {
      fetchMock.mockResolvedValue(
        makeJsonResponse({ error: { message: "Forbidden" } }, 403, "Forbidden"),
      );
      const provider = makeProvider("anthropic", { base_url: "https://api.anthropic.com" });
      await expect(verifyApiKey(provider)).rejects.toThrow("Invalid API key");
    });

    it("sends POST request to /v1/messages endpoint", async () => {
      fetchMock.mockResolvedValue(makeJsonResponse({}, 200));
      const provider = makeProvider("anthropic", { base_url: "https://api.anthropic.com" });
      await verifyApiKey(provider);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.anthropic.com/v1/messages",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("uses default base URL when base_url is empty", async () => {
      fetchMock.mockResolvedValue(makeJsonResponse({}, 200));
      const provider = makeProvider("anthropic", { base_url: "" });
      await verifyApiKey(provider);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.anthropic.com/v1/messages",
        expect.any(Object),
      );
    });

    it("sends x-api-key header with provider api_key", async () => {
      fetchMock.mockResolvedValue(makeJsonResponse({}, 200));
      const provider = makeProvider("anthropic", {
        base_url: "https://api.anthropic.com",
        api_key: "sk-ant-abc",
      });
      await verifyApiKey(provider);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ "x-api-key": "sk-ant-abc" }),
        }),
      );
    });

    it("propagates network error when fetch rejects (timeout/offline)", async () => {
      const networkError = new TypeError("Failed to fetch");
      fetchMock.mockRejectedValue(networkError);
      const provider = makeProvider("anthropic", { base_url: "https://api.anthropic.com" });
      await expect(verifyApiKey(provider)).rejects.toThrow("Failed to fetch");
    });
  });

  describe("google", () => {
    it("resolves on 200 response", async () => {
      fetchMock.mockResolvedValue(makeJsonResponse({ models: [] }, 200));
      const provider = makeProvider("google");
      await expect(verifyApiKey(provider)).resolves.toBeUndefined();
    });

    it("throws on 400", async () => {
      fetchMock.mockResolvedValue(
        makeJsonResponse({ message: "Bad Request" }, 400, "Bad Request"),
      );
      const provider = makeProvider("google");
      await expect(verifyApiKey(provider)).rejects.toThrow("Invalid API key");
    });

    it("throws on 401", async () => {
      fetchMock.mockResolvedValue(makeJsonResponse({ message: "Unauthorized" }, 401, "Unauthorized"));
      const provider = makeProvider("google");
      await expect(verifyApiKey(provider)).rejects.toThrow("Invalid API key");
    });

    it("includes api_key as query parameter", async () => {
      fetchMock.mockResolvedValue(makeJsonResponse({ models: [] }, 200));
      const provider = makeProvider("google", { api_key: "my-google-key" });
      await verifyApiKey(provider);
      const [calledUrl] = fetchMock.mock.calls[0] as [string];
      expect(calledUrl).toContain("key=my-google-key");
    });

    it("throws Connection failed on non-auth HTTP error", async () => {
      fetchMock.mockResolvedValue(makeJsonResponse({ message: "Server Error" }, 500, "Internal Server Error"));
      const provider = makeProvider("google");
      await expect(verifyApiKey(provider)).rejects.toThrow("Connection failed");
    });

    it("propagates network error when fetch rejects (timeout/offline)", async () => {
      const abortError = new DOMException("The operation was aborted.", "AbortError");
      fetchMock.mockRejectedValue(abortError);
      const provider = makeProvider("google");
      await expect(verifyApiKey(provider)).rejects.toThrow("The operation was aborted.");
    });
  });

  describe("azure", () => {
    it("resolves on 200 with correct endpoint", async () => {
      fetchMock.mockResolvedValue(makeJsonResponse({ value: [] }, 200));
      const provider = makeProvider("azure", {
        base_url: "https://my-resource.openai.azure.com",
        config: JSON.stringify({ api_version: "2024-06-01" }),
      });
      await expect(verifyApiKey(provider)).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledWith(
        "https://my-resource.openai.azure.com/openai/deployments?api-version=2024-06-01",
        expect.any(Object),
      );
    });

    it("uses default api-version '2024-06-01' when not in config", async () => {
      fetchMock.mockResolvedValue(makeJsonResponse({}, 200));
      const provider = makeProvider("azure", {
        base_url: "https://my-resource.openai.azure.com",
      });
      await verifyApiKey(provider);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("api-version=2024-06-01"),
        expect.any(Object),
      );
    });

    it("throws on 401", async () => {
      fetchMock.mockResolvedValue(
        makeJsonResponse({ message: "Unauthorized" }, 401, "Unauthorized"),
      );
      const provider = makeProvider("azure", {
        base_url: "https://my-resource.openai.azure.com",
      });
      await expect(verifyApiKey(provider)).rejects.toThrow("Invalid API key");
    });

    it("uses api-version from config when provided", async () => {
      fetchMock.mockResolvedValue(makeJsonResponse({}, 200));
      const provider = makeProvider("azure", {
        base_url: "https://my-resource.openai.azure.com",
        config: JSON.stringify({ api_version: "2025-01-01" }),
      });
      await verifyApiKey(provider);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("api-version=2025-01-01"),
        expect.any(Object),
      );
    });
  });

  describe("minimax", () => {
    it("sends request to /v1/text/chatcompletion_v2 endpoint", async () => {
      fetchMock.mockResolvedValue(makeJsonResponse({ choices: [] }, 200));
      const provider = makeProvider("minimax", { base_url: "https://api.minimaxi.com" });
      await verifyApiKey(provider);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.minimaxi.com/v1/text/chatcompletion_v2",
        expect.any(Object),
      );
    });

    it("normalizes URL: strips /v1 suffix then reconstructs /v1/text/chatcompletion_v2", async () => {
      fetchMock.mockResolvedValue(makeJsonResponse({ choices: [] }, 200));
      const provider = makeProvider("minimax", { base_url: "https://api.minimaxi.com/v1" });
      await verifyApiKey(provider);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.minimaxi.com/v1/text/chatcompletion_v2",
        expect.any(Object),
      );
    });

    it("throws 'Invalid API key' on 401", async () => {
      fetchMock.mockResolvedValue(
        makeJsonResponse({ error: { message: "Bad key" } }, 401, "Unauthorized"),
      );
      const provider = makeProvider("minimax", { base_url: "https://api.minimaxi.com" });
      await expect(verifyApiKey(provider)).rejects.toThrow("Invalid API key");
    });

    it("throws Connection failed on 500", async () => {
      fetchMock.mockResolvedValue(
        makeJsonResponse({ message: "Server Error" }, 500, "Internal Server Error"),
      );
      const provider = makeProvider("minimax", { base_url: "https://api.minimaxi.com" });
      await expect(verifyApiKey(provider)).rejects.toThrow("Connection failed");
    });
  });

  describe("bedrock", () => {
    it("resolves immediately without making any fetch call", async () => {
      const provider = makeProvider("bedrock");
      await expect(verifyApiKey(provider)).resolves.toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("openai (default branch)", () => {
    it("resolves on 200 response", async () => {
      fetchMock.mockResolvedValue(makeJsonResponse({ data: [] }, 200));
      const provider = makeProvider("openai", { base_url: "https://api.openai.com/v1" });
      await expect(verifyApiKey(provider)).resolves.toBeUndefined();
    });

    it("throws 'Invalid API key' on 401", async () => {
      fetchMock.mockResolvedValue(
        makeJsonResponse({ error: { message: "Unauthorized" } }, 401, "Unauthorized"),
      );
      const provider = makeProvider("openai", { base_url: "https://api.openai.com/v1" });
      await expect(verifyApiKey(provider)).rejects.toThrow("Invalid API key");
    });

    it("throws 'Connection failed' on 500", async () => {
      fetchMock.mockResolvedValue(
        makeJsonResponse({ message: "Server error" }, 500, "Internal Server Error"),
      );
      const provider = makeProvider("openai", { base_url: "https://api.openai.com/v1" });
      await expect(verifyApiKey(provider)).rejects.toThrow("Connection failed");
    });

    it("normalizes /v1 suffix: strips and re-appends to build /v1/models", async () => {
      fetchMock.mockResolvedValue(makeJsonResponse({ data: [] }, 200));
      const provider = makeProvider("openai", { base_url: "https://api.openai.com/v1" });
      await verifyApiKey(provider);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.openai.com/v1/models",
        expect.any(Object),
      );
    });

    it("sends Authorization Bearer header", async () => {
      fetchMock.mockResolvedValue(makeJsonResponse({ data: [] }, 200));
      const provider = makeProvider("openai", {
        base_url: "https://api.openai.com/v1",
        api_key: "sk-openai-test",
      });
      await verifyApiKey(provider);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer sk-openai-test",
          }),
        }),
      );
    });

    it("propagates network error when fetch rejects (timeout/offline)", async () => {
      const networkError = new TypeError("Network request failed");
      fetchMock.mockRejectedValue(networkError);
      const provider = makeProvider("openai", { base_url: "https://api.openai.com/v1" });
      await expect(verifyApiKey(provider)).rejects.toThrow("Network request failed");
    });
  });
});
