import type { UserRole } from "../types";

export function formatRoleLabel(role: UserRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function getAuthErrorMessage(error: unknown): string {
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

export function getFallbackDisplayName(email?: string | null): string {
  if (!email) {
    return "";
  }

  return email.split("@")[0] ?? "";
}

export function resolveProfileDisplayName(
  displayName: string,
  email?: string | null
): string {
  return displayName.trim() || getFallbackDisplayName(email);
}

export function getHomeRouteRedirect(input: {
  loading: boolean;
  hasUser: boolean;
  profileLoading: boolean;
  role?: UserRole | null;
}): string | null {
  if (input.loading || (input.hasUser && input.profileLoading)) {
    return null;
  }

  if (input.hasUser && input.role === "evaluator") {
    return "/schedule";
  }

  if (input.hasUser) {
    return "/dashboard";
  }

  return "/login";
}
