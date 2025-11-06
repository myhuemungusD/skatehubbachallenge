import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  User
} from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseAuth, firebaseDb } from "@/lib/firebase/client";

export const useFirebaseAuth = () => {
  const auth = firebaseAuth();
  const db = firebaseDb();
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [handle, setHandleState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeHandle: (() => void) | undefined;
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      unsubscribeHandle?.();
      if (!firebaseUser) {
        setHandleState(null);
        return;
      }

      const handleRef = doc(db, "users", firebaseUser.uid);
      unsubscribeHandle = onSnapshot(handleRef, (snapshot) => {
        setHandleState(snapshot.data()?.handle ?? null);
      });
    });

    return () => {
      unsubscribeHandle?.();
      unsubscribeAuth();
    };
  }, [auth, db]);

  const ensureAnonymous = async () => {
    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }
  };

  const signInWithGoogle = async () => {
    await ensureAnonymous();
    const provider = new GoogleAuthProvider();
    provider.addScope("profile");
    provider.addScope("email");
    await signInWithPopup(auth, provider);
  };

  const setHandle = async (nextHandle: string) => {
    if (!auth.currentUser) {
      throw new Error("User not authenticated");
    }
    const handleRef = doc(db, "users", auth.currentUser.uid);
    await setDoc(
      handleRef,
      {
        handle: nextHandle,
        handleLower: nextHandle.toLowerCase(),
        createdAt: serverTimestamp()
      },
      { merge: true }
    );
  };

  const logout = async () => {
    await signOut(auth);
  };

  return {
    user,
    handle,
    setHandle,
    loading,
    signInWithGoogle,
    ensureAnonymous,
    logout
  };
};
