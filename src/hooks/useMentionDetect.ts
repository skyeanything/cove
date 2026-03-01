import { useCallback, useRef, useState } from "react";

export interface MentionState {
  open: boolean;
  query: string;
  triggerIndex: number;
}

const CLOSED: MentionState = { open: false, query: "", triggerIndex: -1 };

/**
 * Detects `@` mentions in a textarea and provides helpers
 * for updating, closing, and inserting mention text.
 *
 * Rules:
 * - `@` must be at start of input or preceded by whitespace
 * - Query is text between `@` and cursor
 * - Query containing whitespace closes the mention
 */
export function useMentionDetect() {
  const [mentionState, setMentionState] = useState<MentionState>(CLOSED);
  const stateRef = useRef(mentionState);
  stateRef.current = mentionState;

  const updateMention = useCallback((message: string, cursorPos: number) => {
    // Scan backwards from cursor to find '@'
    let atIndex = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      const ch = message.charAt(i);
      // If we hit whitespace before finding '@', no mention
      if (ch === " " || ch === "\n" || ch === "\t") break;
      if (ch === "@") {
        // '@' must be at start or preceded by whitespace
        if (i === 0 || /\s/.test(message.charAt(i - 1))) {
          atIndex = i;
        }
        break;
      }
    }

    if (atIndex === -1) {
      if (stateRef.current.open) setMentionState(CLOSED);
      return;
    }

    const query = message.slice(atIndex + 1, cursorPos);

    // If query contains whitespace, close
    if (/\s/.test(query)) {
      if (stateRef.current.open) setMentionState(CLOSED);
      return;
    }

    setMentionState({ open: true, query, triggerIndex: atIndex });
  }, []);

  const closeMention = useCallback(() => {
    setMentionState(CLOSED);
  }, []);

  /**
   * Replace `@query` with `@type:id ` in the message.
   * Returns the new message and new cursor position.
   */
  const insertMention = useCallback(
    (
      currentMsg: string,
      cursorPos: number,
      type: "tool" | "skill" | "file",
      id: string,
    ): { newMessage: string; newCursorPos: number } => {
      const { triggerIndex } = stateRef.current;
      if (triggerIndex < 0) {
        return { newMessage: currentMsg, newCursorPos: cursorPos };
      }

      const insertText = `@${type}:${id} `;
      const before = currentMsg.slice(0, triggerIndex);
      const after = currentMsg.slice(cursorPos);
      const newMessage = before + insertText + after;
      const newCursorPos = before.length + insertText.length;

      setMentionState(CLOSED);
      return { newMessage, newCursorPos };
    },
    [],
  );

  return { mentionState, updateMention, closeMention, insertMention };
}
