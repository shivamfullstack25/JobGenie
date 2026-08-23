import {useQuery} from "@tanstack/react-query";
import Navigation from "@/components/navigation";
import ATSResumeGenerator from "@/components/ats-resume-generator";
import { useAuth } from "../context/AuthContext";
import { LoadingCard } from '@/components/ui/loading-spinner';

export default function ATSGenerator() {
  const { backendUser, loading } = useAuth();

  const { data: resumes = [] } = useQuery({
    queryKey: ["resumes", backendUser?.id],
    queryFn: async () => {
      if (!backendUser?.id) return [];
      const response = await fetch(`/api/resumes/user/${backendUser.id}`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!backendUser?.id,
  });

  if (loading) return <LoadingCard text="Loading ATS generator..." />;
  if (!backendUser) return <LoadingCard text="Please log in to access ATS generator..." />;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            ATS Resume Generator
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Optimize your resume for Applicant Tracking Systems
          </p>
        </div>

        <ATSResumeGenerator resumes={resumes} />
      </div>
    </div>
  );
}