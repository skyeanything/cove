import { create } from "zustand";

type ClipboardMode = "copy" | "cut";

interface FileClipboardState {
  sourcePath: string | null;
  mode: ClipboardMode | null;
  set: (path: string, mode: ClipboardMode) => void;
  clear: () => void;
}

export const useFileClipboardStore = create<FileClipboardState>()((set) => ({
  sourcePath: null,
  mode: null,
  set: (path, mode) => set({ sourcePath: path, mode }),
  clear: () => set({ sourcePath: null, mode: null }),
}));
