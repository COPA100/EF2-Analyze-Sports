import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Setup from "./pages/Setup";
import Play from "./pages/Play";
import Stats from "./pages/Stats";
import Dashboard from "./pages/Dashboard";
import Leaderboard from "./pages/Leaderboard";
import Seed from "./pages/Seed";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/play/:gameId" element={<Play />} />
        <Route path="/stats/:gameId" element={<Stats />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/seed" element={<Seed />} />
      </Routes>
    </BrowserRouter>
  );
}
