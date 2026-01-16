import { createContext, useContext, useState, type ReactNode } from 'react';

interface TimeframeContextType {
  globalTimeframe: string;
  setGlobalTimeframe: (tf: string) => void;
  isMixed: boolean;
  setMixed: (mixed: boolean) => void;
}

const TimeframeContext = createContext<TimeframeContextType | undefined>(undefined);

export function TimeframeProvider({ children }: { children: ReactNode }) {
  const [globalTimeframe, setGlobalTimeframe] = useState("24h");
  const [isMixed, setMixed] = useState(false);

  const handleSetGlobal = (tf: string) => {
      setGlobalTimeframe(tf);
      setMixed(false); // Force mixed state to false when global is explicitly set
  };

  return (
    <TimeframeContext.Provider value={{ globalTimeframe, setGlobalTimeframe: handleSetGlobal, isMixed, setMixed }}>
      {children}
    </TimeframeContext.Provider>
  );
}

export function useGlobalTimeframe() {
  const context = useContext(TimeframeContext);
  if (context === undefined) {
    throw new Error('useGlobalTimeframe must be used within a TimeframeProvider');
  }
  return context;
}
