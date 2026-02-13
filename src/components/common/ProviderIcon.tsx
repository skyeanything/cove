import { cn } from "@/lib/utils";
import { PROVIDER_METAS } from "@/lib/ai/provider-meta";
import type { ForwardRefExoticComponent, SVGProps, RefAttributes } from "react";

import Anthropic from "@lobehub/icons/es/Anthropic";
import Azure from "@lobehub/icons/es/Azure";
import DeepSeek from "@lobehub/icons/es/DeepSeek";
import Copilot from "@lobehub/icons/es/Copilot";
import Google from "@lobehub/icons/es/Google";
import Groq from "@lobehub/icons/es/Groq";
import Mistral from "@lobehub/icons/es/Mistral";
import Moonshot from "@lobehub/icons/es/Moonshot";
import Ollama from "@lobehub/icons/es/Ollama";
import OpenAI from "@lobehub/icons/es/OpenAI";
import OpenRouter from "@lobehub/icons/es/OpenRouter";
import Perplexity from "@lobehub/icons/es/Perplexity";
import Together from "@lobehub/icons/es/Together";
import XAI from "@lobehub/icons/es/XAI";
import Bedrock from "@lobehub/icons/es/Bedrock";
import Github from "@lobehub/icons/es/Github";

type SvgIcon = ForwardRefExoticComponent<SVGProps<SVGSVGElement> & { size?: string | number } & RefAttributes<SVGSVGElement>>;

export const PROVIDER_ICONS: Record<string, SvgIcon> = {
  anthropic: Anthropic,
  azure: Azure,
  deepseek: DeepSeek,
  "github-copilot": Copilot,
  google: Google,
  groq: Groq,
  mistral: Mistral,
  moonshot: Moonshot,
  ollama: Ollama,
  openai: OpenAI,
  openrouter: OpenRouter,
  perplexity: Perplexity,
  together: Together,
  xai: XAI,
  bedrock: Bedrock,
  "github-models": Github,
  custom: OpenAI,
};

export function ProviderIcon({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  const Icon = PROVIDER_ICONS[type];
  if (!Icon) {
    const meta = PROVIDER_METAS[type as keyof typeof PROVIDER_METAS];
    return (
      <div className={cn("flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold text-muted-foreground", className)}>
        {meta?.displayName.slice(0, 2) ?? "??"}
      </div>
    );
  }
  return <Icon className={cn("size-4 shrink-0", className)} />;
}
