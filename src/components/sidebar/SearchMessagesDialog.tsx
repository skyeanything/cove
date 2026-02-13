"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { messageRepo } from "@/db/repos/messageRepo";
import { useDataStore } from "@/stores/dataStore";
import { useChatStore } from "@/stores/chatStore";

interface SearchMessagesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchMessagesDialog({ open, onOpenChange }: SearchMessagesDialogProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ conversationId: string; snippet: string }[]>([]);
  const [searching, setSearching] = useState(false);

  const conversations = useDataStore((s) => s.conversations);
  const setActiveConversation = useDataStore((s) => s.setActiveConversation);
  const loadMessages = useChatStore((s) => s.loadMessages);

  const runSearch = useCallback(async () => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const list = await messageRepo.searchContent(query.trim());
      setResults(list);
    } finally {
      setSearching(false);
    }
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(runSearch, 200);
    return () => clearTimeout(timer);
  }, [open, runSearch]);

  const handleSelect = (conversationId: string) => {
    setActiveConversation(conversationId);
    loadMessages(conversationId);
    onOpenChange(false);
  };

  // 按会话去重，只保留每个会话第一条片段
  const byConversation = results.reduce<Map<string, string>>((acc, r) => {
    if (!acc.has(r.conversationId)) acc.set(r.conversationId, r.snippet);
    return acc;
  }, new Map());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-4">
        <DialogHeader>
          <DialogTitle>{t("sidebar.searchMessagesTitle")}</DialogTitle>
        </DialogHeader>
        <Input
          placeholder={t("sidebar.searchMessagesPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          className="h-9"
        />
        {searching && (
          <p className="text-[13px] text-muted-foreground">{t("sidebar.searching")}</p>
        )}
        <ScrollArea className="max-h-[280px] rounded-md border border-border">
          <div className="p-2 space-y-1">
            {byConversation.size === 0 && query.trim() && !searching && (
              <p className="py-4 text-center text-[13px] text-muted-foreground">
                {t("sidebar.noSearchResults")}
              </p>
            )}
            {Array.from(byConversation.entries()).map(([convId, snippet]) => {
              const conv = conversations.find((c) => c.id === convId);
              return (
                <button
                  key={convId}
                  type="button"
                  onClick={() => handleSelect(convId)}
                  className="w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-background-tertiary transition-colors"
                >
                  <div className="font-medium truncate">
                    {conv?.title || conv?.id || ""}
                  </div>
                  <div className="mt-0.5 text-[12px] text-muted-foreground line-clamp-2">
                    {snippet}
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
