import { Navigate, Route, Routes } from "react-router-dom";
import { NavBar } from "./components/NavBar";
import { useAuth } from "./context/AuthContext";
import { getHomeRouteRedirect } from "./lib/auth";
import { AssignGame } from "./routes/AssignGame";
import { Crews } from "./routes/Crews";
import { Dashboard } from "./routes/Dashboard";
import { Login } from "./routes/Login";
import { Marketplace } from "./routes/Marketplace";
import { PostGame } from "./routes/PostGame";
import { Profile } from "./routes/Profile";
import { Schedule } from "./routes/Schedule";
import { ScheduleGameDetails } from "./routes/ScheduleGameDetails";

function HomeRoute() {
  const { user, profile, loading, profileLoading } = useAuth();

  const redirect = getHomeRouteRedirect({
    loading,
    hasUser: Boolean(user),
    profileLoading,
    role: profile?.role
  });

  if (!redirect) {
    return (
      <main className="page">
        <p>Loading...</p>
      </main>
    );
  }

  return <Navigate to={redirect} replace />;
}

export default function App() {
  const { user } = useAuth();

  return (
    <>
      {user ? <NavBar /> : null}
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/schedule/games/:gameId" element={<ScheduleGameDetails />} />
        <Route path="/crews" element={<Crews />} />
        <Route path="/assign-game" element={<AssignGame />} />
        <Route path="/post-game" element={<PostGame />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
