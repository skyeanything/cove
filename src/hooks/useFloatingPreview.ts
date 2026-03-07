import { createContext, useContext } from "react";

export interface FloatingPreviewContextValue {
  path: string | null;
  openPopup: (path: string) => void;
  closePopup: () => void;
}

export const FloatingPreviewContext =
  createContext<FloatingPreviewContextValue | null>(null);

/**
 * Returns floating preview context or null when no provider is present.
 * Callers must handle the null case (graceful fallback).
 */
export function useFloatingPreview(): FloatingPreviewContextValue | null {
  return useContext(FloatingPreviewContext);
}
