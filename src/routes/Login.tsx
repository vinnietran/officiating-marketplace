import { Navigate } from "react-router-dom";
import { AuthPanel } from "../components/AuthPanel";
import { Card } from "../components/ui/Card";
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
    <main className="page auth-page">
      <section className="auth-shell">
        <Card as="header" tone="hero" className="hero auth-showcase">
          <span className="hero-eyebrow">Production-ready workflow</span>
          <h1>Officiating Marketplace</h1>
          <p>
            Run bidding, assignments, schedules, and crew coordination from one
            professional operations workspace.
          </p>
          <div className="auth-showcase-grid">
            <article className="auth-showcase-card">
              <span className="hero-stat-label">Role-based access</span>
              <strong className="hero-stat-value">Officials, assignors, schools</strong>
            </article>
            <article className="auth-showcase-card">
              <span className="hero-stat-label">Live operations</span>
              <strong className="hero-stat-value">Marketplace, bids, notifications</strong>
            </article>
            <article className="auth-showcase-card">
              <span className="hero-stat-label">Operational clarity</span>
              <strong className="hero-stat-value">Schedules, crews, post-game details</strong>
            </article>
          </div>
        </Card>

        <AuthPanel />
      </section>
    </main>
  );
}
