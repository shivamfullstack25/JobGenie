import Navigation from "@/components/navigation";
import AnalyticsDashboard from "@/components/analytics-dashboard";
import { useAuth } from "@/context/AuthContext";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useLocation } from "wouter";
import { useEffect } from "react";

export default function Analytics() {
  const { user, loading, isAdmin } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      setLocation("/login");
    }
  }, [user, loading, setLocation]);

  // Redirect non-admin users
  useEffect(() => {
    if (!loading && user && !isAdmin) {
      setLocation("/dashboard");
    }
  }, [user, loading, isAdmin, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" type="ai-analysis" text="Loading analytics..." />
      </div>
    );
  }

  if (!user || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <AnalyticsDashboard />
    </div>
  );
} 