import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, onAuthStateChanged, doc, getDoc, setDoc, onSnapshot, updateDoc, increment, getCountFromServer, collection, query, where, getDocs } from './firebase';
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
  inviteCode?: string;
  seenAnnouncements?: string[];
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

        // Generate a stable invite code from uid
        const inviteCode = firebaseUser.uid.slice(0, 8).toUpperCase();

        const newUserData: UserData = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || '',
          photoURL: firebaseUser.photoURL || '',
          role: firebaseUser.email === 'edublitz71@gmail.com' ? 'admin' : 'user',
          isBlocked: false,
          tokens: 100,
          inviteCode,
          seenAnnouncements: [],
        };

        // ── Step 1: create doc if it doesn't exist, with retries ──
        const ensureUserDoc = async (): Promise<boolean> => {
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const snap = await getDoc(userDocRef);
              if (snap.exists()) {
                // Backfill inviteCode for existing users who never got one
                const data = snap.data();
                if (!data.inviteCode) {
                  updateDoc(userDocRef, { inviteCode }).catch(() => {});
                }
                return true;
              }
              // Doc missing — create it
              await setDoc(userDocRef, newUserData);
              console.log('User doc created successfully');
              updateDoc(doc(db, 'stats', 'global'), { totalAccounts: increment(1) })
                .catch(() => {});
              // Handle referral bonus
              // signInWithPopup keeps the URL intact, so read ?ref= directly
              try {
                const refCode = new URLSearchParams(window.location.search).get('ref');
                if (refCode && refCode !== inviteCode) {
                  const refSnap = await getDocs(query(collection(db, 'users'), where('inviteCode', '==', refCode)));
                  if (!refSnap.empty) {
                    const referrerDoc = refSnap.docs[0];
                    // Referrer gets 25 tokens
                    await updateDoc(doc(db, 'users', referrerDoc.id), {
                      tokens: (referrerDoc.data().tokens ?? 100) + 25
                    });
                    // New user gets 25 extra tokens (125 total)
                    await updateDoc(userDocRef, { tokens: 125 });
                  }
                }
              } catch(e) { console.error('Referral bonus failed', e); }
              return true;
            } catch (e: any) {
              console.error(`User doc init attempt ${attempt} failed:`, e?.code, e?.message);
              if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
            }
          }
          return false;
        };

        const created = await ensureUserDoc();

        if (!created) {
          // Rules are blocking us — set local userData so the app doesn't hang,
          // but the doc won't be in Firestore until rules are fixed.
          console.error('CRITICAL: Cannot write to Firestore. Check security rules for database:', db.app.options);
          setUserData(newUserData);
          setLoading(false);
          return;
        }

        // ── Step 2: live listener — doc now guaranteed to exist ──
        unsubDoc = onSnapshot(userDocRef, async (docSnap) => {
          if (!docSnap.exists()) {
            setLoading(false);
            return;
          }
          let currentData = docSnap.data() as UserData;

          // Ensure tokens field exists for old accounts created before the token system
          if (currentData.tokens === undefined) {
            updateDoc(userDocRef, { tokens: 100 }).catch(() => {});
            currentData = { ...currentData, tokens: 100 };
          }

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
          console.error('Firestore snapshot error:', error?.code, error?.message);
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
