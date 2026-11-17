import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { pb } from "../lib/pb";
import type { User } from "../types";

interface AuthValue {
  ready: boolean;
  user: User | null;
}

const AuthContext = createContext<AuthValue | null>(null);

const LOCAL_EMAIL = "local@intelliprints.local";
const LOCAL_PASSWORD = "intelliprints-local";

function currentUser(): User | null {
  const record = pb.authStore.record;
  if (!pb.authStore.isValid || !record) return null;
  return {
    id: record.id,
    email: typeof record.email === "string" ? record.email : "",
    name: typeof record.name === "string" ? record.name : "",
  };
}

async function openLocalSession() {
  try {
    await pb.collection("users").authWithPassword(LOCAL_EMAIL, LOCAL_PASSWORD);
  } catch {
    await pb.collection("users").create({
      name: "Workshop",
      email: LOCAL_EMAIL,
      password: LOCAL_PASSWORD,
      passwordConfirm: LOCAL_PASSWORD,
      emailVisibility: false,
    });
    await pb.collection("users").authWithPassword(LOCAL_EMAIL, LOCAL_PASSWORD);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(currentUser);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = pb.authStore.onChange(() => setUser(currentUser()));
    void (async () => {
      try {
        if (pb.authStore.isValid) {
          await pb.collection("users").authRefresh();
        } else {
          await openLocalSession();
        }
      } catch {
        pb.authStore.clear();
        try {
          await openLocalSession();
        } catch {
          // The local account could not be opened. The shell stays closed.
        }
      } finally {
        if (!cancelled) {
          setUser(currentUser());
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={{ ready, user }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
