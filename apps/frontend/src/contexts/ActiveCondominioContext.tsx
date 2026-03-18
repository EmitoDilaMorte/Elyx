import { createContext, useContext, useState, type ReactNode } from 'react';

type ActiveCondominioContextValue = {
  activeCondominioId: number | null;
  setActiveCondominioId: (condominioId: number) => void;
};

const ActiveCondominioContext = createContext<ActiveCondominioContextValue | undefined>(undefined);

type ActiveCondominioProviderProps = {
  children: ReactNode;
};

export function ActiveCondominioProvider({ children }: ActiveCondominioProviderProps) {
  const [activeCondominioId, setActiveCondominioIdState] = useState<number | null>(null);

  const setActiveCondominioId = (condominioId: number) => {
    setActiveCondominioIdState(condominioId);
  };

  return (
    <ActiveCondominioContext.Provider value={{ activeCondominioId, setActiveCondominioId }}>
      {children}
    </ActiveCondominioContext.Provider>
  );
}

export function useActiveCondominio() {
  const context = useContext(ActiveCondominioContext);
  if (!context) {
    throw new Error('useActiveCondominio must be used within ActiveCondominioProvider');
  }
  return context;
}
