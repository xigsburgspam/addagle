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
  dailyVideoLimit?: number;
  dailyVideoUsage?: number;
  lastVideoDate?: string;
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
        
        unsubDoc = onSnapshot(userDocRef, async (docSnap) => {
          let currentData: UserData;
          if (docSnap.exists()) {
            currentData = docSnap.data() as UserData;
          } else {
            currentData = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || '',
              photoURL: firebaseUser.photoURL || '',
              role: firebaseUser.email === 'edublitz71@gmail.com' ? 'admin' : 'user',
              isBlocked: false,
              videoCount: 0,
              lastVideoDate: '',
              dailyVideoLimit: 60,
              dailyVideoUsage: 0,
            };
            await setDoc(userDocRef, currentData).catch(e => handleFirestoreError(e, OperationType.CREATE, `users/${firebaseUser.uid}`));
            await updateDoc(doc(db, 'stats', 'global'), {
              totalAccounts: increment(1)
            }).catch(e => handleFirestoreError(e, OperationType.UPDATE, 'stats/global'));
          }

          // Check if email is blocked
          if (firebaseUser.email) {
            const emailBlockRef = doc(db, 'blocked_emails', firebaseUser.email);
            const emailBlockSnap = await getDoc(emailBlockRef);
            if (emailBlockSnap.exists()) {
              currentData.isEmailBlocked = true;
              currentData.isBlocked = true; // Force block if email is blocked
            }
          }

          setUserData(currentData);
          setLoading(false);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
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
