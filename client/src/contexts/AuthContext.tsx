import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updatePassword,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { SchoolUser, UserRole } from "@shared/types";

interface AuthContextValue {
  user: User | null;
  schoolUser: SchoolUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  refreshSchoolUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [schoolUser, setSchoolUser] = useState<SchoolUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSchoolUser = async (uid: string) => {
    // School membership is stored under schools/{schoolId}/users/{uid}
    // For bootstrap we also keep a top-level user profile that points to the school.
    const profileRef = doc(db, "userProfiles", uid);
    const profileSnap = await getDoc(profileRef);
    if (!profileSnap.exists()) {
      setSchoolUser(null);
      return;
    }
    const profile = profileSnap.data() as { schoolId: string; role: UserRole; displayName: string; email: string };
    const memberRef = doc(db, "schools", profile.schoolId, "users", uid);
    const memberSnap = await getDoc(memberRef);
    if (!memberSnap.exists()) {
      setSchoolUser(null);
      return;
    }
    setSchoolUser({ id: uid, ...memberSnap.data() } as SchoolUser);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          await loadSchoolUser(firebaseUser.uid);
        } catch (e) {
          console.error("Failed to load school user", e);
          setSchoolUser(null);
        }
      } else {
        setSchoolUser(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const register = async (email: string, password: string, displayName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // Minimal profile; school creation / joining happens after first login.
    await setDoc(doc(db, "userProfiles", cred.user.uid), {
      email,
      displayName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  const logout = async () => {
    await signOut(auth);
    setSchoolUser(null);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const changePassword = async (newPassword: string) => {
    if (!auth.currentUser) throw new Error("Not authenticated");
    await updatePassword(auth.currentUser, newPassword);
  };

  const refreshSchoolUser = async () => {
    if (user) await loadSchoolUser(user.uid);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        schoolUser,
        loading,
        login,
        register,
        logout,
        resetPassword,
        changePassword,
        refreshSchoolUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
