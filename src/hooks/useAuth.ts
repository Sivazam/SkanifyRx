import { useState, useEffect, useCallback } from 'react';
import {
  onIdTokenChanged,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  GoogleAuthProvider,
  signInWithPopup,
  type ConfirmationResult,
  type User,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import type { AuthUser } from '../types';

declare global {
  interface Window {
    recaptchaVerifier: RecaptchaVerifier | null;
  }
}

import { doc, onSnapshot, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { UserProfile } from '../types';

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let profileUnsubscribe: () => void;

    const authUnsubscribe = onIdTokenChanged(auth, async (fbUser) => {
      // onIdTokenChanged also fires on every token refresh (getIdToken(true)). Tear down any
      // previous profile listener first so we don't accumulate snapshot subscriptions.
      if (profileUnsubscribe) profileUnsubscribe();

      if (fbUser) {
        const token = await fbUser.getIdTokenResult();
        setFirebaseUser(fbUser);
        setUser({
          uid: fbUser.uid,
          phoneNumber: fbUser.phoneNumber,
          email: fbUser.email,
          displayName: fbUser.displayName,
          pharmacyId: (token.claims.pharmacyId as string) || null,
          role: (token.claims.role as 'admin' | 'staff') || 'admin',
        });

        // Setup real-time listener for Firestore user profile
        const userRef = doc(db, 'users', fbUser.uid);

        // Ensure the document exists. Privilege/billing fields (role, active, credits,
        // totalScans, monthlyLimit) are set to safe defaults on creation and are NEVER
        // written by the client afterwards — they are owned by Cloud Functions / admins and
        // enforced by Firestore rules. Wrapped so a denied write can't block the profile listener.
        try {
          const userDoc = await getDoc(userRef);
          if (!userDoc.exists()) {
            const newProfile: Partial<UserProfile> = {
              uid: fbUser.uid,
              displayName: fbUser.displayName || null,
              email: fbUser.email || null,
              phoneNumber: fbUser.phoneNumber || null,
              pharmacyId: (token.claims.pharmacyId as string) || null,
              role: 'user', // Default to normal user in Firestore
              active: false, // Default to inactive until admin approves
              totalScans: 0,
              credits: 0,
              monthlyLimit: null,
              createdAt: new Date(),
              lastLoginAt: new Date()
            };
            await setDoc(userRef, {
              ...newProfile,
              createdAt: serverTimestamp(),
              lastLoginAt: serverTimestamp()
            });
          } else {
            // Only touch non-privileged fields on subsequent logins.
            const data = userDoc.data();
            const updates: Record<string, unknown> = { lastLoginAt: serverTimestamp() };
            if (data.displayName === undefined) updates.displayName = fbUser.displayName || null;
            await setDoc(userRef, updates, { merge: true });
          }
        } catch (err) {
          console.error('Failed to sync user profile document:', err);
        }

        profileUnsubscribe = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserProfile({
              ...data,
              uid: fbUser.uid,
              createdAt: data.createdAt?.toDate() || new Date(),
              lastLoginAt: data.lastLoginAt?.toDate() || new Date(),
            } as UserProfile);
          } else {
            setUserProfile(null);
          }
          setLoading(false);
        });

      } else {
        setFirebaseUser(null);
        setUser(null);
        setUserProfile(null);
        setLoading(false);
        if (profileUnsubscribe) profileUnsubscribe();
      }
    });

    return () => {
      authUnsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
    };
  }, []);

  const sendOtp = useCallback(
    async (phoneNumber: string, recaptchaContainerId: string) => {
      try {
        if (window.recaptchaVerifier) {
          window.recaptchaVerifier.clear();
          window.recaptchaVerifier = null;
        }
        
        window.recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaContainerId, {
          size: 'invisible',
        });
        
        const confirmation = await signInWithPhoneNumber(auth, phoneNumber, window.recaptchaVerifier);
        return confirmation;
      } catch (error) {
        if (window.recaptchaVerifier) {
          window.recaptchaVerifier.clear();
          window.recaptchaVerifier = null;
        }
        throw error;
      }
    },
    []
  );

  const verifyOtp = useCallback(
    async (confirmation: ConfirmationResult, otp: string) => {
      const credential = await confirmation.confirm(otp);
      // Force token refresh to pick up custom claims (set by Cloud Function on signup)
      await credential.user.getIdToken(true);
      return credential.user;
    },
    []
  );

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    // Force token refresh to pick up custom claims
    await result.user.getIdToken(true);
    return result.user;
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  // Force refresh token to pick up new custom claims
  const refreshToken = useCallback(async () => {
    if (firebaseUser) {
      await firebaseUser.getIdToken(true);
    }
  }, [firebaseUser]);

  return { user, userProfile, loading, sendOtp, verifyOtp, signInWithGoogle, signOut, refreshToken };
}
