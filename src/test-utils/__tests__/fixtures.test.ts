import { describe, it, expect } from "vitest";
import {
  makeProvider,
  makeProviderWithConfig,
  makeModelInfo,
} from "../fixtures/providers";
import {
  makeMessage,
  makeConversation,
  makeAttachment,
  makeAssistant,
  makeMessagePair,
} from "../fixtures/messages";

describe("provider fixtures", () => {
  it("makeProvider returns valid defaults", () => {
    const p = makeProvider();
    expect(p.id).toBe("provider-1");
    expect(p.type).toBe("openai");
    expect(p.enabled).toBe(1);
  });

  it("makeProvider accepts overrides", () => {
    const p = makeProvider({ type: "anthropic", name: "Claude" });
    expect(p.type).toBe("anthropic");
    expect(p.name).toBe("Claude");
  });

  it("makeProviderWithConfig serializes config", () => {
    const p = makeProviderWithConfig({}, { aws_region: "us-east-1" });
    expect(JSON.parse(p.config!)).toEqual({ aws_region: "us-east-1" });
  });

  it("makeModelInfo returns valid defaults", () => {
    const m = makeModelInfo();
    expect(m.id).toBe("gpt-4o");
    expect(m.provider_type).toBe("openai");
  });

  it("makeModelInfo accepts overrides", () => {
    const m = makeModelInfo({ id: "claude-3", provider_type: "anthropic" });
    expect(m.id).toBe("claude-3");
  });
});

describe("message fixtures", () => {
  it("makeMessage returns valid defaults", () => {
    const msg = makeMessage();
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("Hello, world!");
    expect(msg.conversation_id).toBe("conv-1");
  });

  it("makeMessage generates unique IDs", () => {
    const a = makeMessage();
    const b = makeMessage();
    expect(a.id).not.toBe(b.id);
  });

  it("makeMessage accepts overrides", () => {
    const msg = makeMessage({ role: "assistant", content: "Reply" });
    expect(msg.role).toBe("assistant");
    expect(msg.content).toBe("Reply");
  });

  it("makeConversation returns valid defaults", () => {
    const conv = makeConversation();
    expect(conv.assistant_id).toBe("assistant-1");
    expect(conv.pinned).toBe(0);
  });

  it("makeAttachment returns valid defaults", () => {
    const att = makeAttachment();
    expect(att.type).toBe("image");
    expect(att.mime_type).toBe("image/png");
  });

  it("makeAssistant returns valid defaults", () => {
    const a = makeAssistant();
    expect(a.temperature).toBe(0.7);
    expect(a.top_p).toBe(1);
  });

  it("makeMessagePair creates user + assistant pair", () => {
    const [user, assistant] = makeMessagePair("conv-x", "Q", "A");
    expect(user.role).toBe("user");
    expect(user.content).toBe("Q");
    expect(assistant.role).toBe("assistant");
    expect(assistant.content).toBe("A");
    expect(assistant.parent_id).toBe(user.id);
    expect(assistant.conversation_id).toBe("conv-x");
  });
});
