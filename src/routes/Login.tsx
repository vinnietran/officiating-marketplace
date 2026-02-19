import { Navigate } from "react-router-dom";
import { AuthPanel } from "../components/AuthPanel";
import { useAuth } from "../context/AuthContext";

export function Login() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="page">
        <p>Loading...</p>
      </main>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="page">
      <header className="hero">
        <h1>Officiating Marketplace</h1>
        <p>Sign in to continue.</p>
      </header>
      <AuthPanel />
    </main>
  );
}
