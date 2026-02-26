import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));
vi.mock("./provider-factory", () => ({
  getModel: vi.fn().mockReturnValue("mock-model"),
}));
vi.mock("@/db/repos/conversationRepo", () => ({
  conversationRepo: { update: vi.fn() },
}));
vi.mock("@/prompts/conversation-title.md?raw", () => ({
  default: "Generate title for: {{user_message}}",
}));

import { generateText } from "ai";
import { getModel } from "./provider-factory";
import { conversationRepo } from "@/db/repos/conversationRepo";
import { generateConversationTitleFromUserQuestion } from "./generate-title";
import { makeProvider } from "@/test-utils";

const mockGenerateText = vi.mocked(generateText);
const mockGetModel = vi.mocked(getModel);
const mockUpdate = vi.mocked(conversationRepo.update);

describe("generateConversationTitleFromUserQuestion", () => {
  const provider = makeProvider();
  const opts = { provider, modelId: "gpt-4o" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateText.mockResolvedValue({ text: "Test Title" } as Awaited<
      ReturnType<typeof generateText>
    >);
  });

  it("returns early for empty text without calling generateText", async () => {
    await generateConversationTitleFromUserQuestion("conv-1", "", opts);

    expect(mockGenerateText).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns early for whitespace-only text", async () => {
    await generateConversationTitleFromUserQuestion("conv-1", "   ", opts);

    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("calls getModel with provider and modelId", async () => {
    await generateConversationTitleFromUserQuestion("conv-1", "Hello", opts);

    expect(mockGetModel).toHaveBeenCalledWith(provider, "gpt-4o");
  });

  it("calls generateText with system prompt and messages", async () => {
    await generateConversationTitleFromUserQuestion("conv-1", "How do I sort an array?", opts);

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "mock-model",
        system: expect.stringContaining("How do I sort an array?"),
        messages: [{ role: "user", content: "Generate the title." }],
        maxOutputTokens: 50,
      }),
    );
  });

  it("updates conversation with generated title", async () => {
    mockGenerateText.mockResolvedValue({ text: "Array Sorting" } as Awaited<
      ReturnType<typeof generateText>
    >);

    await generateConversationTitleFromUserQuestion("conv-1", "Hello", opts);

    expect(mockUpdate).toHaveBeenCalledWith("conv-1", { title: "Array Sorting" });
  });

  it("truncates user input to 500 characters", async () => {
    const longQuestion = "x".repeat(1000);
    await generateConversationTitleFromUserQuestion("conv-1", longQuestion, opts);

    const systemArg = mockGenerateText.mock.calls[0]?.[0]?.system as string;
    // The prompt template replaces {{user_message}} with sliced input
    expect(systemArg).not.toContain("x".repeat(501));
    expect(systemArg).toContain("x".repeat(500));
  });

  it("truncates generated title to 100 characters", async () => {
    mockGenerateText.mockResolvedValue({ text: "T".repeat(200) } as Awaited<
      ReturnType<typeof generateText>
    >);

    await generateConversationTitleFromUserQuestion("conv-1", "Hello", opts);

    const titleArg = mockUpdate.mock.calls[0]?.[1]?.title as string;
    expect(titleArg).toHaveLength(100);
  });

  it("does not update if generated title is empty after trim", async () => {
    mockGenerateText.mockResolvedValue({ text: "   " } as Awaited<
      ReturnType<typeof generateText>
    >);

    await generateConversationTitleFromUserQuestion("conv-1", "Hello", opts);

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
