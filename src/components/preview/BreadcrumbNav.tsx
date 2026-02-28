import { ChevronRight } from "lucide-react";
import { useFilePreviewStore } from "@/stores/filePreviewStore";

interface BreadcrumbNavProps {
  path: string;
}

export function BreadcrumbNav({ path }: BreadcrumbNavProps) {
  const setPendingExpandPath = useFilePreviewStore((s) => s.setPendingExpandPath);

  const segments = path.split("/");

  return (
    <div className="flex min-w-0 items-center gap-0.5 overflow-hidden">
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        // Build the path up to this segment
        const segmentPath = segments.slice(0, index + 1).join("/");

        return (
          <span key={segmentPath} className="flex shrink-0 items-center gap-0.5 last:shrink">
            {index > 0 && (
              <ChevronRight className="size-3 shrink-0 text-foreground-tertiary" strokeWidth={1.5} />
            )}
            {isLast ? (
              <span className="min-w-0 truncate font-medium text-foreground" title={segment}>
                {segment}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setPendingExpandPath(segmentPath)}
                className="min-w-0 truncate text-foreground-secondary hover:text-foreground"
                title={segmentPath}
              >
                {segment}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
