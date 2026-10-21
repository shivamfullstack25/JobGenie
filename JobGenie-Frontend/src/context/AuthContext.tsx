import { API_BASE_URL } from "../lib/queryClient";
import React, { createContext, useContext, useEffect, useState } from "react";
import { auth } from "../firebase";
import {
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  User as FirebaseUser
} from "firebase/auth";

interface BackendUser {
  id: number;
  email: string;
  name: string;
  role: string;
  firebaseUid: string;
  isEmailVerified: boolean;
  authProvider?: string;
  profileImageUrl?: string;
  avatar?: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  phone?: string;
  phoneNumber?: string;
  location?: string;
  website?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  // Free-form user preferences/settings JSON (see PreferencesController / User.settings).
  settings?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  backendUser: BackendUser | null;
  /** Alias for pages that still expect `user` — prefers Firebase session */
  user: FirebaseUser | null;
  loading: boolean;
  isAdmin: boolean;
  isAuthenticated: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithGithub: () => Promise<void>;
  logout: () => Promise<void>;
  refreshBackendUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [backendUser, setBackendUser] = useState<BackendUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setFirebaseUser(firebaseUser);
      setLoading(true);
      
      if (firebaseUser) {
        try {
          // Get Firebase ID token
          const idToken = await firebaseUser.getIdToken();
          
          // Verify token with backend and get/create user
          const response = await fetch(`${API_BASE_URL}/api/auth/verify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              idToken: idToken,
              deviceId: 'web',
              userAgent: navigator.userAgent
            }),
          });

          if (response.ok) {
            const authResponse = await response.json();
            if (authResponse.success) {
              setBackendUser(authResponse.user);
              setIsAdmin(authResponse.user.role === "admin");
            } else {
              console.error('Backend authentication failed:', authResponse.message);
              setBackendUser(null);
              setIsAdmin(false);
            }
          } else {
            console.error('Backend authentication request failed');
            setBackendUser(null);
            setIsAdmin(false);
          }
        } catch (error) {
          console.error('Error during authentication:', error);
          setBackendUser(null);
          setIsAdmin(false);
        }
      } else {
        setBackendUser(null);
        setIsAdmin(false);
      }
      
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const refreshBackendUser = async () => {
    if (!firebaseUser) return;
    
    try {
      const idToken = await firebaseUser.getIdToken(true); // Force refresh
      
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idToken: idToken,
        }),
      });

      if (response.ok) {
        const authResponse = await response.json();
        if (authResponse.success) {
          setBackendUser(authResponse.user);
          setIsAdmin(authResponse.user.role === "admin");
        }
      }
    } catch (error) {
      console.error('Error refreshing backend user:', error);
    }
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const loginWithGithub = async () => {
    const provider = new GithubAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    try {
      // Notify backend about logout
      if (backendUser?.firebaseUid) {
        await fetch(`${API_BASE_URL}/api/auth/logout?firebaseUid=${backendUser.firebaseUid}`, {
          method: 'POST',
        });
      }
    } catch (error) {
      console.error('Error during logout:', error);
    }
    
    await signOut(auth);
    setBackendUser(null);
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider value={{ 
      firebaseUser, 
      backendUser,
      user: firebaseUser,
      loading, 
      isAdmin,
      isAuthenticated: !!firebaseUser,
      loginWithGoogle, 
      loginWithGithub, 
      logout,
      refreshBackendUser
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}; 