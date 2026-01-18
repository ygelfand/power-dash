import { createContext, useContext, useState, type ReactNode } from 'react';

interface RefreshContextType {
  isPaused: boolean;
  setPaused: (paused: boolean) => void;
}

const RefreshContext = createContext<RefreshContextType | undefined>(undefined);

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [isPaused, setPaused] = useState(false);

  return (
    <RefreshContext.Provider value={{ isPaused, setPaused }}>
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
