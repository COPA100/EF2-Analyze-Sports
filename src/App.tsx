import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Setup from "./pages/Setup";
import Play from "./pages/Play";
import Stats from "./pages/Stats";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/play/:gameId" element={<Play />} />
        <Route path="/stats/:gameId" element={<Stats />} />
      </Routes>
    </BrowserRouter>
  );
}
