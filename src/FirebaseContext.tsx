import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, onAuthStateChanged, doc, getDoc, setDoc, onSnapshot } from './firebase';
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
}

interface FirebaseContextType {
  user: FirebaseUser | null;
  userData: UserData | null;
  loading: boolean;
  isAdmin: boolean;
}

const FirebaseContext = createContext<FirebaseContextType>({
  user: null,
  userData: null,
  loading: true,
  isAdmin: false,
});

export const useFirebase = () => useContext(FirebaseContext);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        
        const unsubDoc = onSnapshot(userDocRef, async (docSnap) => {
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
            };
            await setDoc(userDocRef, currentData).catch(e => handleFirestoreError(e, OperationType.CREATE, `users/${firebaseUser.uid}`));
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

        return () => unsubDoc();
      } else {
        setUserData(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const value = {
    user,
    userData,
    loading,
    isAdmin: userData?.role === 'admin',
  };

  return (
    <FirebaseContext.Provider value={value}>
      {children}
    </FirebaseContext.Provider>
  );
};
