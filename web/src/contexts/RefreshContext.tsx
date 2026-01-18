import { createContext, useContext, useState, type ReactNode } from 'react';

interface RefreshContextType {
  isPaused: boolean;
  setPaused: (paused: boolean) => void;
  refreshKey: number;
  manualRefresh: () => void;
  isRefreshing: boolean;
}

const RefreshContext = createContext<RefreshContextType | undefined>(undefined);

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [isPaused, setPaused] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const manualRefresh = () => {
    setRefreshKey((prev) => prev + 1);
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  return (
    <RefreshContext.Provider value={{ isPaused, setPaused, refreshKey, manualRefresh, isRefreshing }}>
      {children}
    </RefreshContext.Provider>
  );
}

export function useRefresh() {
  const context = useContext(RefreshContext);
  if (context === undefined) {
    throw new Error('useRefresh must be used within a RefreshProvider');
  }
  return context;
}
