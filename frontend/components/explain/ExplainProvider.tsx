"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const STORAGE_KEY = "flagplane-explain";

type ExplainContextValue = {
  /** When true, guide callouts show and dense "Advanced details" default collapsed. */
  explain: boolean;
  setExplain: (value: boolean) => void;
  toggleExplain: () => void;
};

const ExplainContext = createContext<ExplainContextValue | null>(null);

// Module-level external store backed by localStorage, read via
// useSyncExternalStore so it's SSR-safe (no effect/setState) and even stays in
// sync across tabs. Default ON (teaching is the default).
const listeners = new Set<() => void>();

function readExplain(): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "0") return false;
    if (stored === "1") return true;
  } catch {
    // localStorage unavailable (private mode) — fall through to the default.
  }
  return true;
}

function writeExplain(value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Ignore persistence failures.
  }
  listeners.forEach((l) => l());
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

// Server + first hydration render use the default (true) so hydration matches;
// the client snapshot then reflects the persisted value.
function getServerSnapshot(): boolean {
  return true;
}

/**
 * Global "explanation-first" state. Default ON (teaching is the default). One
 * switch (TopBar) drives the whole app: ON shows the guide voice and collapses
 * dense operator detail; OFF hides callouts and expands it. Persisted in
 * localStorage so a returning visitor keeps their preference.
 */
export function ExplainProvider({ children }: { children: ReactNode }) {
  const explain = useSyncExternalStore(
    subscribe,
    readExplain,
    getServerSnapshot
  );

  const setExplain = useCallback((value: boolean) => writeExplain(value), []);
  const toggleExplain = useCallback(() => writeExplain(!readExplain()), []);

  return (
    <ExplainContext.Provider value={{ explain, setExplain, toggleExplain }}>
      {children}
    </ExplainContext.Provider>
  );
}

export function useExplain(): ExplainContextValue {
  const ctx = useContext(ExplainContext);
  if (!ctx) {
    throw new Error("useExplain must be used within an ExplainProvider");
  }
  return ctx;
}
