import React from "react";
import { FilePathChip } from "@/components/common/FilePathChip";

const MENTION_REGEX = /@(file|tool|skill):(\S+)/g;

/**
 * Parse @file:path / @tool:name / @skill:name in user message text
 * and return React nodes with interactive elements.
 */
export function renderContentWithMentions(content: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(MENTION_REGEX)) {
    const [full, type, value] = match;
    const start = match.index;

    // Text before the match
    if (start > lastIndex) {
      nodes.push(<span key={`t${lastIndex}`}>{content.slice(lastIndex, start)}</span>);
    }

    if (type === "file") {
      nodes.push(<FilePathChip key={`m${start}`} path={value!} />);
    } else {
      // tool/skill: render as styled inline badge
      nodes.push(
        <span
          key={`m${start}`}
          className="inline-flex items-center rounded-md bg-background-tertiary px-1.5 py-0.5 text-[12px] font-medium text-foreground-secondary"
        >
          @{type}:{value}
        </span>,
      );
    }

    lastIndex = start + full!.length;
  }

  // If no mentions found, return original content as-is
  if (lastIndex === 0) {
    return [content];
  }

  // Remaining text after last mention
  if (lastIndex < content.length) {
    nodes.push(<span key={`t${lastIndex}`}>{content.slice(lastIndex)}</span>);
  }

  return nodes;
}
