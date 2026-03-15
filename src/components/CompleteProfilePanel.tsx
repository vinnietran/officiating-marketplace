import { useMemo, useState } from "react";
import { Button } from "./ui/Button";
import { Select } from "./ui/Select";
import { useAuth } from "../context/AuthContext";
import {
  formatRoleLabel,
  getFallbackDisplayName,
  resolveProfileDisplayName
} from "../lib/auth";
import type { UserRole } from "../types";

const ROLE_OPTIONS: UserRole[] = ["official", "assignor", "school", "evaluator"];

export function CompleteProfilePanel() {
  const { user, completeProfile, signOut } = useAuth();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [role, setRole] = useState<UserRole>("official");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fallbackName = useMemo(() => {
    return getFallbackDisplayName(user?.email);
  }, [user]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const nameToSave = resolveProfileDisplayName(displayName, user?.email);
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
      <div className="auth-panel-header">
        <span className="hero-eyebrow">Finish onboarding</span>
        <h2>Complete Your Profile</h2>
        <p className="meta-line">
          Your account exists, but role setup is missing. Choose your role to continue.
        </p>
      </div>

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
          <Select
            value={role}
            onValueChange={(value) => setRole(value)}
            options={ROLE_OPTIONS.map((roleOption) => ({
              value: roleOption,
              label: formatRoleLabel(roleOption)
            }))}
          />
        </label>

        {error ? <p className="error-text">{error}</p> : null}

        <div className="auth-actions">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Save Profile"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => signOut()}
          >
            Sign Out
          </Button>
        </div>

        <p className="auth-panel-footer">
          Profile completion enables the correct permissions, navigation, and workflows.
        </p>
      </form>
    </section>
  );
}
