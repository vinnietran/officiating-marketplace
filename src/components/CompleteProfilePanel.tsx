import { useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { UserRole } from "../types";

const ROLE_OPTIONS: UserRole[] = ["official", "assignor", "school", "evaluator"];

function formatRoleLabel(role: UserRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function CompleteProfilePanel() {
  const { user, completeProfile, signOut } = useAuth();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [role, setRole] = useState<UserRole>("official");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fallbackName = useMemo(() => {
    if (!user?.email) {
      return "";
    }
    return user.email.split("@")[0] ?? "";
  }, [user]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const nameToSave = displayName.trim() || fallbackName;
    if (!nameToSave) {
      setError("Display name is required.");
      return;
    }

    try {
      setSubmitting(true);
      await completeProfile({
        displayName: nameToSave,
        role
      });
    } catch (submitError) {
      const submitMessage =
        submitError instanceof Error ? submitError.message : "Unable to complete profile.";
      setError(submitMessage);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-panel">
      <h2>Complete Your Profile</h2>
      <p className="meta-line">
        Your account exists, but role setup is missing. Choose your role to continue.
      </p>

      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          Email
          <input type="email" value={user?.email ?? ""} disabled />
        </label>

        <label>
          Display Name
          <input
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder={fallbackName || "Your name"}
          />
        </label>

        <label>
          Role
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
          >
            {ROLE_OPTIONS.map((roleOption) => (
              <option key={roleOption} value={roleOption}>
                {formatRoleLabel(roleOption)}
              </option>
            ))}
          </select>
        </label>

        {error ? <p className="error-text">{error}</p> : null}

        <div className="auth-actions">
          <button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Save Profile"}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={() => signOut()}
          >
            Sign Out
          </button>
        </div>
      </form>
    </section>
  );
}
