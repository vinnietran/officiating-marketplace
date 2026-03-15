import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "./ui/Button";
import { Select } from "./ui/Select";
import { useAuth } from "../context/AuthContext";
import { formatRoleLabel, getAuthErrorMessage } from "../lib/auth";
import type { UserRole } from "../types";

type AuthMode = "signin" | "signup";

const ROLES: UserRole[] = ["official", "assignor", "school", "evaluator"];

export function AuthPanel() {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("official");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (mode === "signup" && !displayName.trim()) {
      setError("Display name is required.");
      return;
    }

    try {
      setSubmitting(true);

      if (mode === "signin") {
        await signIn(email.trim(), password);
      } else {
        await signUp({
          email: email.trim(),
          password,
          displayName: displayName.trim(),
          role
        });
      }

      navigate("/", { replace: true });
    } catch (submitError) {
      setError(getAuthErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-panel">
      <div className="auth-panel-header">
        <span className="hero-eyebrow">
          {mode === "signin" ? "Secure access" : "Account setup"}
        </span>
        <h2>{mode === "signin" ? "Sign In" : "Create Account"}</h2>
        <p className="meta-line">
          {mode === "signin"
            ? "Access the marketplace with your existing account."
            : "Choose your role to unlock role-based actions."}
        </p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={6}
          />
        </label>

        {mode === "signup" ? (
          <>
            <label>
              Display Name
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                required
              />
            </label>

            <label>
              Role
              <Select
                value={role}
                onValueChange={(value) => setRole(value)}
                options={ROLES.map((roleOption) => ({
                  value: roleOption,
                  label: formatRoleLabel(roleOption)
                }))}
              />
            </label>
          </>
        ) : null}

        {error ? <p className="error-text">{error}</p> : null}

        <div className="auth-actions">
          <Button type="submit" disabled={submitting}>
            {submitting
              ? "Please wait..."
              : mode === "signin"
                ? "Sign In"
                : "Create Account"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setMode((currentMode) =>
                currentMode === "signin" ? "signup" : "signin"
              );
              setError(null);
            }}
          >
            {mode === "signin" ? "Need an account?" : "Have an account?"}
          </Button>
        </div>

        <p className="auth-panel-footer">
          {mode === "signin"
            ? "Real-time game activity, crew coordination, and role-based workflows."
            : "Accounts are provisioned with role-specific navigation and access controls."}
        </p>
      </form>
    </section>
  );
}
