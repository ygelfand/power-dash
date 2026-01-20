import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

interface LabelConfig {
  global: Record<string, string>;
}

interface LabelContextType {
  labels: LabelConfig;
  loading: boolean;
  refresh: () => Promise<void>;
  getLabel: (original: string) => string;
}

const LabelContext = createContext<LabelContextType | null>(null);

export function LabelProvider({ children }: { children: ReactNode }) {
  const [labels, setLabels] = useState<LabelConfig>({ global: {} });
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await fetch("/api/v1/labels");
      if (res.ok) {
        const data = await res.json();
        setLabels(data.config || { global: {} });
      }
    } catch (e) {
      console.error("Failed to fetch labels", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const getLabel = (original: string) => {
    if (!labels.global) return original;
    return labels.global[original] || original;
  };

  return (
    <LabelContext.Provider value={{ labels, loading, refresh, getLabel }}>
      {children}
    </LabelContext.Provider>
  );
}

export function useLabels() {
  const ctx = useContext(LabelContext);
  if (!ctx) throw new Error("useLabels must be used within LabelProvider");
  return ctx;
}
