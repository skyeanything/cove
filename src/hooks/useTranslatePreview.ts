import { useState, useCallback, useRef } from "react";
import { streamText } from "ai";
import { getModel } from "@/lib/ai/provider-factory";
import { providerRepo } from "@/db/repos/providerRepo";
import { useChatStore } from "@/stores/chatStore";

/** Max characters sent to LLM for translation. */
const CHAR_LIMIT = 20000;

export interface TranslatePreviewState {
  isTranslateMode: boolean;
  translating: boolean;
  translated: string | null;
  error: string | null;
  toggleTranslate: (text: string) => void;
  reset: () => void;
}

export function useTranslatePreview(): TranslatePreviewState {
  const [isTranslateMode, setIsTranslateMode] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const modelId = useChatStore((s) => s.modelId);
  const providerId = useChatStore((s) => s.providerId);
  const providerType = useChatStore((s) => s.providerType);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setIsTranslateMode(false);
    setTranslated(null);
    setTranslating(false);
    setError(null);
  }, []);

  const translate = useCallback(
    async (text: string) => {
      if (!modelId) {
        setError("no_model");
        setIsTranslateMode(true);
        return;
      }

      const allProviders = await providerRepo.getAll();
      const provider = providerId
        ? allProviders.find((p) => p.id === providerId)
        : allProviders.find((p) => p.type === providerType && p.enabled);

      if (!provider) {
        setError("no_provider");
        setIsTranslateMode(true);
        return;
      }

      abortRef.current = new AbortController();
      setIsTranslateMode(true);
      setTranslating(true);
      setTranslated("");
      setError(null);

      try {
        const stream = streamText({
          model: getModel(provider, modelId),
          system:
            "你是专业翻译。将用户提供的内容忠实地翻译成中文，保持原有格式、段落结构和换行不变。只输出译文，不添加任何说明或解释。",
          messages: [{ role: "user", content: text.slice(0, CHAR_LIMIT) }],
          abortSignal: abortRef.current.signal,
        });

        let acc = "";
        for await (const chunk of stream.textStream) {
          acc += chunk;
          setTranslated(acc);
        }
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") {
          setError(String(e));
        }
      } finally {
        setTranslating(false);
      }
    },
    [modelId, providerId, providerType],
  );

  const toggleTranslate = useCallback(
    (text: string) => {
      if (isTranslateMode) {
        reset();
      } else {
        void translate(text);
      }
    },
    [isTranslateMode, reset, translate],
  );

  return { isTranslateMode, translating, translated, error, toggleTranslate, reset };
}
