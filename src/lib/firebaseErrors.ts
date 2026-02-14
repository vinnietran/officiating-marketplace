export function getReadableFirestoreError(error: unknown, databaseId: string): string {
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (message.includes("Database '(default)' not found") || message.includes("Database") && message.includes("not found")) {
    return `Firestore database '${databaseId}' was not found. Create that database in Firebase Console, or set VITE_FIRESTORE_DATABASE_ID to an existing database ID.`;
  }

  if (message.includes("Missing or insufficient permissions")) {
    return "Firestore permission denied. Publish the rules from firestore.rules.";
  }

  return `Firestore error: ${message}`;
}
