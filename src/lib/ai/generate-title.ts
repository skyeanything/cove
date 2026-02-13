import { generateText } from "ai";
import type { Provider } from "@/db/types";
import { getModel } from "./provider-factory";
import { conversationRepo } from "@/db/repos/conversationRepo";
import conversationTitlePrompt from "@/prompts/conversation-title.md?raw";

/**
 * 根据用户首条问题异步生成会话标题（LLM 简短摘要），不阻塞主流程。
 * 在用户发送首条消息后即可调用，无需等 AI 回复。
 * 提示词见 src/prompts/conversation-title.md，可直接修改该文件。
 */
export async function generateConversationTitleFromUserQuestion(
  conversationId: string,
  userQuestion: string,
  options: { provider: Provider; modelId: string },
): Promise<void> {
  const text = (userQuestion || "").trim();
  if (!text) return;

  const model = getModel(options.provider, options.modelId);
  const userInput = text.slice(0, 500);
  const systemPrompt = conversationTitlePrompt.replace("{{user_message}}", userInput);

  const { text: title } = await generateText({
    model,
    system: systemPrompt,
    messages: [{ role: "user", content: "Generate the title." }],
    maxOutputTokens: 50,
  });

  const trimmed = title.trim().slice(0, 100);
  if (trimmed) await conversationRepo.update(conversationId, { title: trimmed });
}
