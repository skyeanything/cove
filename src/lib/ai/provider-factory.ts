import { createOpenAI } from "@ai-sdk/openai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createMoonshotAI } from "@ai-sdk/moonshotai";
import type { LanguageModel } from "ai";
import type { Provider, ProviderConfig } from "@/db/types";

function parseConfig(provider: Provider): ProviderConfig {
  if (!provider.config) return {};
  try {
    return JSON.parse(provider.config) as ProviderConfig;
  } catch {
    return {};
  }
}

export function getModel(provider: Provider, modelId: string): LanguageModel {
  const config = parseConfig(provider);

  switch (provider.type) {
    case "openai": {
      const openai = createOpenAI({
        apiKey: provider.api_key,
        baseURL: provider.base_url || undefined,
      });
      return openai(modelId);
    }

    case "aliyun": {
      const aliyun = createOpenAI({
        apiKey: provider.api_key,
        baseURL: provider.base_url || "https://dashscope.aliyuncs.com/compatible-mode/v1",
      });
      return aliyun.chat(modelId);
    }

    case "anthropic": {
      const anthropic = createAnthropic({
        apiKey: provider.api_key,
        baseURL: provider.base_url || undefined,
      });
      return anthropic(modelId);
    }

    case "google": {
      const google = createGoogleGenerativeAI({
        apiKey: provider.api_key,
        baseURL: provider.base_url || undefined,
      });
      return google(modelId);
    }

    case "bedrock": {
      const bedrock = createAmazonBedrock({
        region: config.aws_region || "us-east-1",
        accessKeyId: config.aws_access_key_id,
        secretAccessKey: config.aws_secret_access_key,
      });
      return bedrock(modelId);
    }

    case "azure": {
      const azure = createOpenAI({
        apiKey: provider.api_key,
        baseURL: provider.base_url,
      });
      return azure(modelId);
    }

    case "ollama": {
      const ollama = createOpenAI({
        apiKey: "ollama",
        baseURL: `${provider.base_url || "http://localhost:11434"}/v1`,
      });
      return ollama(modelId);
    }

    case "tencent-cloud": {
      const tencentCloud = createOpenAI({
        apiKey: provider.api_key,
        baseURL: provider.base_url || "https://api.hunyuan.cloud.tencent.com/v1",
      });
      return tencentCloud.chat(modelId);
    }

    case "volcengine-ark": {
      const volcengineArk = createOpenAI({
        apiKey: provider.api_key,
        baseURL: provider.base_url || "https://ark.ap-southeast.bytepluses.com/api/v3",
      });
      return volcengineArk.chat(modelId);
    }

    case "deepseek": {
      const deepseek = createDeepSeek({
        apiKey: provider.api_key ?? "",
        baseURL: provider.base_url || undefined,
      });
      return deepseek.chat(modelId);
    }

    case "groq": {
      const groq = createOpenAI({
        apiKey: provider.api_key,
        baseURL: provider.base_url || "https://api.groq.com/openai/v1",
      });
      return groq(modelId);
    }

    case "mistral": {
      const mistral = createOpenAI({
        apiKey: provider.api_key,
        baseURL: provider.base_url || "https://api.mistral.ai/v1",
      });
      return mistral(modelId);
    }

    case "minimax": {
      const base = (provider.base_url || "https://api.minimaxi.com").replace(/\/+$/, "");
      const minimax = createOpenAI({
        apiKey: provider.api_key,
        baseURL: base.endsWith("/v1") ? base : `${base}/v1`,
      });
      // MiniMax OpenAI 兼容端当前不保证支持 /responses，显式走 /chat/completions
      return minimax.chat(modelId);
    }

    case "moonshot": {
      const base = provider.base_url || "https://api.moonshot.cn";
      const moonshot = createMoonshotAI({
        apiKey: provider.api_key,
        baseURL: base.endsWith("/v1") ? base : `${base}/v1`,
      });
      return moonshot.chatModel(modelId);
    }

    case "openrouter": {
      const openrouter = createOpenAI({
        apiKey: provider.api_key,
        baseURL: provider.base_url || "https://openrouter.ai/api/v1",
      });
      return openrouter(modelId);
    }

    case "perplexity": {
      const perplexity = createOpenAI({
        apiKey: provider.api_key,
        baseURL: provider.base_url || "https://api.perplexity.ai",
      });
      return perplexity(modelId);
    }

    case "together": {
      const together = createOpenAI({
        apiKey: provider.api_key,
        baseURL: provider.base_url || "https://api.together.xyz/v1",
      });
      return together(modelId);
    }

    case "xai": {
      const xai = createOpenAI({
        apiKey: provider.api_key,
        baseURL: provider.base_url || "https://api.x.ai/v1",
      });
      return xai(modelId);
    }

    case "github-copilot":
    case "github-models":
    case "custom": {
      const custom = createOpenAI({
        apiKey: provider.api_key || "no-key",
        baseURL: provider.base_url || undefined,
      });
      return custom(modelId);
    }

    default:
      throw new Error(`Unsupported provider type: ${provider.type}`);
  }
}
