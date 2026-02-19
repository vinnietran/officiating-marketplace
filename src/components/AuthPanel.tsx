import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { UserRole } from "../types";

type AuthMode = "signin" | "signup";

const ROLES: UserRole[] = ["official", "assignor", "school", "evaluator"];

function formatRoleLabel(role: UserRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function getErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "Something went wrong.";
  }

  const message = "message" in error ? String(error.message) : "Something went wrong.";

  if (message.includes("auth/email-already-in-use")) {
    return "This email is already in use.";
  }
  if (message.includes("auth/invalid-credential")) {
    return "Invalid email or password.";
  }
  if (message.includes("auth/weak-password")) {
    return "Password should be at least 6 characters.";
  }

  return message;
}

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
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-panel">
      <h2>{mode === "signin" ? "Sign In" : "Create Account"}</h2>
      <p className="meta-line">
        {mode === "signin"
          ? "Access the marketplace with your existing account."
          : "Choose your role to unlock role-based actions."}
      </p>

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
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as UserRole)}
              >
                {ROLES.map((roleOption) => (
                  <option key={roleOption} value={roleOption}>
                    {formatRoleLabel(roleOption)}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}

        {error ? <p className="error-text">{error}</p> : null}

        <div className="auth-actions">
          <button type="submit" disabled={submitting}>
            {submitting
              ? "Please wait..."
              : mode === "signin"
                ? "Sign In"
                : "Create Account"}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              setMode((currentMode) =>
                currentMode === "signin" ? "signup" : "signin"
              );
              setError(null);
            }}
          >
            {mode === "signin" ? "Need an account?" : "Have an account?"}
          </button>
        </div>
      </form>
    </section>
  );
}
