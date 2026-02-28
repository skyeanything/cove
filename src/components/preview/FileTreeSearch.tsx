import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

interface FileTreeSearchProps {
  searchOpen: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  closeSearch: () => void;
  matchCount: number;
}

export function FileTreeSearch({
  searchOpen,
  searchQuery,
  setSearchQuery,
  closeSearch,
  matchCount,
}: FileTreeSearchProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [searchOpen]);

  if (!searchOpen) return null;

  return (
    <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5">
      <Search className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
      <Input
        ref={inputRef}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={t("preview.searchPlaceholder")}
        className="h-6 border-none bg-transparent px-0 text-[13px] shadow-none focus-visible:ring-0"
        onKeyDown={(e) => {
          if (e.key === "Escape") closeSearch();
        }}
      />
      {searchQuery && (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {matchCount}
        </span>
      )}
      <button
        type="button"
        onClick={closeSearch}
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background-tertiary hover:text-foreground"
      >
        <X className="size-3" strokeWidth={1.5} />
      </button>
    </div>
  );
}
