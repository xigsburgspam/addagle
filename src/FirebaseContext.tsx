import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, onAuthStateChanged, doc, getDoc, setDoc, onSnapshot, updateDoc, increment, getCountFromServer, collection } from './firebase';
import { User as FirebaseUser } from 'firebase/auth';
import { handleFirestoreError, OperationType } from './utils/firestoreErrorHandler';

interface UserData {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: 'admin' | 'user';
  isBlocked: boolean;
  isEmailBlocked?: boolean;
  savedDisplayName?: string;
  hasSavedName?: boolean;
  blockedUsers?: string[];
  tokens?: number;
  videoCallsToday?: number;
  lastCallDate?: string;
}

interface FirebaseContextType {
  user: FirebaseUser | null;
  userData: UserData | null;
  loading: boolean;
  isAdmin: boolean;
  updateDisplayName: (name: string, save: boolean) => Promise<void>;
  removeDisplayName: () => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType>({
  user: null,
  userData: null,
  loading: true,
  isAdmin: false,
  updateDisplayName: async () => {},
  removeDisplayName: async () => {},
});

export const useFirebase = () => useContext(FirebaseContext);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubDoc: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (unsubDoc) {
        unsubDoc();
        unsubDoc = null;
      }

      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);

        // ── Step 1: ensure the user document exists before subscribing ──
        // We do a one-time read first so we never hit the race where
        // onSnapshot fires on a missing doc while isAdmin() in rules
        // tries to get() the same missing doc and throws.
        try {
          const snap = await getDoc(userDocRef);
          if (!snap.exists()) {
            const newUser: UserData = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || '',
              photoURL: firebaseUser.photoURL || '',
              role: firebaseUser.email === 'edublitz71@gmail.com' ? 'admin' : 'user',
              isBlocked: false,
              tokens: 100,
            };
            await setDoc(userDocRef, newUser);
            // Update account counter (best-effort)
            updateDoc(doc(db, 'stats', 'global'), { totalAccounts: increment(1) })
              .catch(e => console.error('Stats update failed:', e));
          }
        } catch (e) {
          console.error('User doc init failed:', e);
        }

        // ── Step 2: live listener — doc is guaranteed to exist now ──
        unsubDoc = onSnapshot(userDocRef, async (docSnap) => {
          if (!docSnap.exists()) {
            // Shouldn't happen, but handle gracefully
            setLoading(false);
            return;
          }
          let currentData = docSnap.data() as UserData;

          // Check if email is blocked
          if (firebaseUser.email) {
            try {
              const emailBlockSnap = await getDoc(doc(db, 'blocked_emails', firebaseUser.email));
              if (emailBlockSnap.exists()) {
                currentData = { ...currentData, isEmailBlocked: true, isBlocked: true };
              }
            } catch (e) {
              console.error('Failed to check blocked email:', e);
            }
          }

          setUserData(currentData);
          setLoading(false);
        }, (error) => {
          console.error('Firestore snapshot error:', error);
          setLoading(false);
        });
      } else {
        setUserData(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubDoc) unsubDoc();
    };
  }, []);

  const updateDisplayName = async (name: string, save: boolean) => {
    if (!user) return;
    const userDocRef = doc(db, 'users', user.uid);
    await updateDoc(userDocRef, {
      savedDisplayName: save ? name : null,
      hasSavedName: save
    }).catch(e => handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`));
  };

  const removeDisplayName = async () => {
    if (!user) return;
    const userDocRef = doc(db, 'users', user.uid);
    await updateDoc(userDocRef, {
      savedDisplayName: null,
      hasSavedName: false
    }).catch(e => handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`));
  };

  const value = {
    user,
    userData,
    loading,
    isAdmin: userData?.role === 'admin',
    updateDisplayName,
    removeDisplayName,
  };

  return (
    <FirebaseContext.Provider value={value}>
      {children}
    </FirebaseContext.Provider>
  );
};
