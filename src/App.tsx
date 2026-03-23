import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { UserProvider, useUser } from './context/UserContext';
import Login from './pages/Login';
import Home from './pages/Home';
import GameSetup from './pages/GameSetup';
import GamePlay from './pages/GamePlay';
import Analysis from './pages/Analysis';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { playerId } = useUser();
  if (!playerId) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { playerId } = useUser();

  return (
    <Routes>
      <Route path="/" element={playerId ? <Navigate to="/home" replace /> : <Login />} />
      <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/setup/:type" element={<ProtectedRoute><GameSetup /></ProtectedRoute>} />
      <Route path="/play/:gameId" element={<ProtectedRoute><GamePlay /></ProtectedRoute>} />
      <Route path="/analysis/:gameId" element={<ProtectedRoute><Analysis /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <UserProvider>
        <AppRoutes />
      </UserProvider>
    </BrowserRouter>
  );
}
