import { tool } from "ai";
import { z } from "zod/v4";
import { handleSettings } from "./settings-handlers";

export const settingsTool = tool({
  description: `Read/modify app settings. Categories: appearance, layout, general, skills, provider, assistant. Actions: get, set, list, create (provider), delete (provider), validate (provider), fetch_models (provider), probe (provider, needs model_id). Use 'list' to discover available keys in a category.`,
  inputSchema: z.object({
    action: z.enum(["get", "set", "list", "create", "delete", "validate", "fetch_models", "probe"]),
    category: z.enum([
      "appearance",
      "layout",
      "general",
      "skills",
      "provider",
      "assistant",
    ]),
    key: z.string().optional().describe("Setting key within the category"),
    value: z.string().optional().describe("New value (for set action)"),
    provider_type: z
      .string()
      .optional()
      .describe("Provider type identifier (for provider category)"),
    provider_id: z
      .string()
      .optional()
      .describe("Provider ID (for custom provider operations)"),
    provider_name: z
      .string()
      .optional()
      .describe("Provider display name (for create action)"),
    protocol: z
      .string()
      .optional()
      .describe("API protocol: openai, anthropic, or google (for custom providers)"),
    assistant_name: z
      .string()
      .optional()
      .describe("Assistant name (for assistant category)"),
    model_id: z
      .string()
      .optional()
      .describe("Model ID within provider (for probe action)"),
  }),
  execute: async (input) => {
    try {
      return await handleSettings(input);
    } catch (err) {
      return `Settings error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});
