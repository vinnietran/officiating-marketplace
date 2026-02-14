import { Navigate, Route, Routes } from "react-router-dom";
import { NavBar } from "./components/NavBar";
import { Marketplace } from "./routes/Marketplace";
import { Crews } from "./routes/Crews";
import { PostGame } from "./routes/PostGame";
import { Profile } from "./routes/Profile";
import { Schedule } from "./routes/Schedule";
import { ScheduleGameDetails } from "./routes/ScheduleGameDetails";

export default function App() {
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<Marketplace />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/schedule/games/:gameId" element={<ScheduleGameDetails />} />
        <Route path="/crews" element={<Crews />} />
        <Route path="/post-game" element={<PostGame />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
