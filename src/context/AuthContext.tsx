import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type User
} from "firebase/auth";
import { IS_E2E, auth } from "../lib/firebase";
import { createUserProfile, getUserProfile } from "../lib/firestore";
import { e2eAuth } from "../test-support/e2e/harness";
import type { UserProfile, UserRole } from "../types";

interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
}

interface CompleteProfileInput {
  displayName: string;
  role: UserRole;
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  profileLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  completeProfile: (input: CompleteProfileInput) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const PROFILE_LOOKUP_TIMEOUT_MS = 5000;

  function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        reject(new Error(`Profile lookup timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      promise
        .then((value) => {
          window.clearTimeout(timeoutId);
          resolve(value);
        })
        .catch((error) => {
          window.clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  useEffect(() => {
    const handleAuthChange = (nextUser: User | null) => {
      setUser(nextUser);

      if (!nextUser) {
        setProfile(null);
        setProfileLoading(false);
        setLoading(false);
        return;
      }

      setLoading(false);
      setProfileLoading(true);

      void withTimeout(getUserProfile(nextUser.uid), PROFILE_LOOKUP_TIMEOUT_MS)
        .then((existingProfile) => {
          setProfile(existingProfile);
        })
        .catch((error) => {
          console.error("Failed to load user profile from Firestore.", error);
          setProfile(null);
        })
        .finally(() => {
          setProfileLoading(false);
        });
    };

    const unsubscribe = IS_E2E
      ? e2eAuth.onAuthStateChanged(handleAuthChange)
      : onAuthStateChanged(auth, handleAuthChange);

    return () => unsubscribe();
  }, []);

  async function signIn(email: string, password: string): Promise<void> {
    if (IS_E2E) {
      await e2eAuth.signIn(email, password);
      return;
    }

    await signInWithEmailAndPassword(auth, email, password);
  }

  async function signUp(input: SignUpInput): Promise<void> {
    const credential = IS_E2E
      ? { user: await e2eAuth.signUp(input) }
      : await createUserWithEmailAndPassword(auth, input.email, input.password);

    if (IS_E2E) {
      await e2eAuth.updateProfile(credential.user, {
        displayName: input.displayName
      });
    } else {
      await updateProfile(credential.user, {
        displayName: input.displayName
      });
    }

    const createdProfile: UserProfile = {
      uid: credential.user.uid,
      email: input.email,
      emailLowercase: input.email.toLowerCase(),
      displayName: input.displayName,
      role: input.role,
      createdAtISO: new Date().toISOString()
    };

    await createUserProfile(createdProfile);
    setProfile(createdProfile);
    setProfileLoading(false);
  }

  async function completeProfile(input: CompleteProfileInput): Promise<void> {
    if (!user) {
      throw new Error("No authenticated user found.");
    }

    const displayName = input.displayName.trim();
    if (!displayName) {
      throw new Error("Display name is required.");
    }

    if (IS_E2E) {
      await e2eAuth.updateProfile(user, { displayName });
    } else {
      await updateProfile(user, { displayName });
    }

    const createdProfile: UserProfile = {
      uid: user.uid,
      email: user.email ?? "",
      emailLowercase: (user.email ?? "").toLowerCase(),
      displayName,
      role: input.role,
      createdAtISO: new Date().toISOString()
    };

    await createUserProfile(createdProfile);
    setProfile(createdProfile);
    setProfileLoading(false);
  }

  async function signOut(): Promise<void> {
    if (IS_E2E) {
      await e2eAuth.signOut();
      return;
    }

    await firebaseSignOut(auth);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      profileLoading,
      signIn,
      signUp,
      completeProfile,
      signOut
    }),
    [user, profile, loading, profileLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
