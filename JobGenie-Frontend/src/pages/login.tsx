import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { LoadingCard } from "@/components/ui/loading-spinner";
import { auth } from "../firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendEmailVerification, sendPasswordResetEmail } from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { Mail, Lock, User, ArrowRight, Github, Sparkles, Shield, CheckCircle, Eye, EyeOff } from "lucide-react";

const db = getFirestore();

const Login: React.FC = () => {
  const { user, loading, loginWithGoogle, loginWithGithub } = useAuth();
  const [, setLocation] = useLocation();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [showVerifyMsg, setShowVerifyMsg] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!loading && user && !isRegister && !resetMode) {
      setLocation("/dashboard");
    }
  }, [user, loading, setLocation, isRegister, resetMode]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFormLoading(true);
    try {
      if (isRegister) {
        if (!fullName.trim()) {
          setError("Full name is required.");
          setFormLoading(false);
          return;
        }
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: fullName });
        // Save user data to Firestore
        await setDoc(doc(db, "users", cred.user.uid), {
          uid: cred.user.uid,
          name: fullName,
          email: cred.user.email,
          photoURL: cred.user.photoURL || "",
          provider: "password",
          createdAt: new Date().toISOString()
        });
        await sendEmailVerification(cred.user);
        setShowVerifyMsg(true);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setFormLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFormLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch (err: any) {
      setError(err.message || "Failed to send reset email");
    } finally {
      setFormLoading(false);
    }
  };

  if (loading) return <LoadingCard text="Loading..." />;

  if (showVerifyMsg) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
        <div className="bg-white/80 backdrop-blur-md p-10 rounded-3xl shadow-2xl border border-white/20 flex flex-col gap-8 w-full max-w-md text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-lg">
            <CheckCircle className="h-10 w-10 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent mb-4">
              Verify Your Email
            </h2>
            <p className="text-gray-600 leading-relaxed">
              A verification link has been sent to <span className="font-semibold text-blue-600">{email}</span>.
              <br />Please check your inbox and verify your email before logging in.
            </p>
          </div>
          <Button 
            onClick={() => { setIsRegister(false); setShowVerifyMsg(false); setEmail(""); setPassword(""); setFullName(""); }}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 py-3 rounded-xl"
          >
            Back to Login
          </Button>
        </div>
      </div>
    );
  }

  if (resetMode) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
        <div className="bg-white/80 backdrop-blur-md p-10 rounded-3xl shadow-2xl border border-white/20 flex flex-col gap-8 w-full max-w-md text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto shadow-lg">
            <Shield className="h-10 w-10 text-white" />
          </div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
            Reset Password
          </h2>
          {resetSent ? (
            <>
              <p className="text-gray-600 leading-relaxed">
                A password reset link has been sent to <span className="font-semibold text-blue-600">{email}</span>.
                <br />Please check your inbox.
              </p>
              <Button 
                onClick={() => { setResetMode(false); setResetSent(false); setEmail(""); }}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 py-3 rounded-xl"
              >
                Back to Login
              </Button>
            </>
          ) : (
            <form className="flex flex-col gap-6" onSubmit={handlePasswordReset}>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="email"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors bg-white/50 backdrop-blur-sm"
                  required
                />
              </div>
              {error && (
                <div className="text-red-500 text-sm text-center bg-red-50 p-3 rounded-xl border border-red-200">
                  {error}
                </div>
              )}
              <Button 
                type="submit" 
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 py-3 rounded-xl" 
                disabled={formLoading}
              >
                {formLoading ? "Sending..." : "Send Reset Link"}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => { setResetMode(false); setResetSent(false); setError(""); }}
                className="border-2 hover:bg-gray-50 transition-all duration-200 py-3 rounded-xl"
              >
                Back to Login
              </Button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
      <div className="bg-white/80 backdrop-blur-md p-10 rounded-3xl shadow-2xl border border-white/20 flex flex-col gap-8 w-full max-w-md">
        {/* Header */}
        <div className="text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
            <Sparkles className="h-10 w-10 text-white" />
          </div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent mb-2">
            {isRegister ? "Join JobGenie" : "Welcome Back"}
          </h2>
          <p className="text-gray-600">
            {isRegister ? "Create your account to start your AI-powered job search" : "Sign in to continue your career journey"}
          </p>
        </div>

        {/* Form */}
        <form className="flex flex-col gap-6" onSubmit={handleEmailAuth}>
          {isRegister && (
            <div className="relative">
              <User className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Full Name"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors bg-white/50 backdrop-blur-sm"
                required
              />
            </div>
          )}
          
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors bg-white/50 backdrop-blur-sm"
              required
            />
          </div>
          
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full pl-12 pr-12 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors bg-white/50 backdrop-blur-sm"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center bg-red-50 p-3 rounded-xl border border-red-200">
              {error}
            </div>
          )}

          <Button 
            type="submit" 
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 py-3 rounded-xl group" 
            disabled={formLoading}
          >
            <span className="flex items-center justify-center gap-2">
              {formLoading ? (
                isRegister ? "Creating Account..." : "Signing In..."
              ) : (
                <>
                  {isRegister ? "Create Account" : "Sign In"}
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </span>
          </Button>
        </form>

        {/* Toggle Register/Login */}
        <div className="text-center">
          <span className="text-gray-600">
            {isRegister ? "Already have an account?" : "Don't have an account?"}
          </span>
          <button
            className="ml-2 text-blue-600 font-medium hover:text-blue-700 transition-colors"
            onClick={() => { setIsRegister(r => !r); setError(""); }}
          >
            {isRegister ? "Sign In" : "Create Account"}
          </button>
        </div>

        {/* Forgot Password */}
        {!isRegister && (
          <div className="text-center">
            <button
              className="text-gray-500 text-sm hover:text-blue-600 transition-colors"
              onClick={() => { setResetMode(true); setError(""); }}
            >
              Forgot your password?
            </button>
          </div>
        )}

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-white text-gray-500">Or continue with</span>
          </div>
        </div>

        {/* Social Login */}
        <div className="flex flex-col gap-3">
          <Button 
            onClick={loginWithGoogle} 
            className="bg-white hover:bg-gray-50 text-gray-700 border-2 border-gray-200 hover:border-gray-300 w-full shadow-lg hover:shadow-xl transition-all duration-300 py-3 rounded-xl group"
          >
            <div className="flex items-center justify-center gap-3">
              <div className="w-5 h-5 bg-gradient-to-r from-red-500 to-orange-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">G</span>
              </div>
              <span className="font-medium">Continue with Google</span>
            </div>
          </Button>
          
          <Button 
            onClick={loginWithGithub} 
            className="bg-gray-900 hover:bg-gray-800 text-white w-full shadow-lg hover:shadow-xl transition-all duration-300 py-3 rounded-xl group"
          >
            <div className="flex items-center justify-center gap-3">
              <Github className="h-5 w-5" />
              <span className="font-medium">Continue with GitHub</span>
            </div>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Login; 