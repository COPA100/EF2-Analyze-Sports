import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface UserContextType {
  playerId: string | null;
  login: (id: string) => void;
  logout: () => void;
}

const UserContext = createContext<UserContextType>({
  playerId: null,
  login: () => {},
  logout: () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [playerId, setPlayerId] = useState<string | null>(() => {
    return sessionStorage.getItem('playerId');
  });

  const login = useCallback((id: string) => {
    setPlayerId(id);
    sessionStorage.setItem('playerId', id);
  }, []);

  const logout = useCallback(() => {
    setPlayerId(null);
    sessionStorage.removeItem('playerId');
  }, []);

  return (
    <UserContext.Provider value={{ playerId, login, logout }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
