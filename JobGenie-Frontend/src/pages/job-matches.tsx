import {useQuery} from "@tanstack/react-query";
import {useState} from "react";
import Navigation from "@/components/navigation";
import JobMatchCard from "@/components/job-match-card";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {jobAPI, resumeAPI} from "@/lib/api";
import {useToast} from "@/hooks/use-toast";
import { useAuth } from "../context/AuthContext";
import { LoadingCard } from '@/components/ui/loading-spinner';
import EmailVerificationBanner from "@/components/EmailVerificationBanner";

export default function JobMatches() {
  const { backendUser, loading } = useAuth();
  const [resumeId, setResumeId] = useState("");
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("");
  const [savingJobId, setSavingJobId] = useState<string | null>(null);
  const [applyingJobId, setApplyingJobId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: resumes = [] } = useQuery({
    queryKey: ["user-resumes", backendUser?.id],
    queryFn: async () => {
      if (!backendUser?.id) return [];
      return resumeAPI.getUserResumes(backendUser.id);
    },
    enabled: !!backendUser?.id,
  });

  const effectiveResumeId =
    resumeId || (Array.isArray(resumes) && resumes[0]?.id ? String(resumes[0].id) : "");

  const { data: jobMatches = [], isLoading: matchesLoading, refetch: refetchMatches } = useQuery({
    queryKey: ["job-matches", backendUser?.id, effectiveResumeId],
    queryFn: async () => {
      if (!backendUser?.id) return [];
      const response = await jobAPI.getJobMatches(
        backendUser.id.toString(),
        effectiveResumeId || undefined,
      );
      return response.matches || [];
    },
    enabled: !!backendUser?.id,
  });

  const { data: searchResults = [], isLoading: searchLoading, refetch: refetchSearch } = useQuery({
    queryKey: ["job-search", keywords, location],
    queryFn: async () => {
      if (!keywords && !location) return [];
      const response = await jobAPI.searchJobs(keywords, location, 1, 10);
      return response || [];
    },
    enabled: !!(keywords || location),
  });

  const handleSearch = () => {
    if (keywords || location) {
      refetchSearch();
    }
  };

  const handleGenerateMatches = () => {
    if (!backendUser?.id) {
      toast({
        title: "Error",
        description: "Please log in to generate matches",
        variant: "destructive",
      });
      return;
    }
    refetchMatches();
  };

  const handleSaveJob = async (job: any) => {
    if (!backendUser?.id) return;
    const jobId = job.id || job.jobId;
    if (!jobId) {
      toast({ title: "Error", description: "Job ID missing", variant: "destructive" });
      return;
    }
    setSavingJobId(String(jobId));
    try {
      await jobAPI.saveJob({
        userId: backendUser.id,
        jobId: String(jobId),
        title: job.title,
        company: job.company,
        location: job.location,
        platform: job.platform,
        url: job.url,
        matchScore: job.matchScore || job.matchPercentage,
      });
      toast({ title: "Saved", description: `${job.title} saved to your list` });
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e?.message || "Could not save job",
        variant: "destructive",
      });
    } finally {
      setSavingJobId(null);
    }
  };

  // Click-out apply: JobMatchCard already opened the job's real URL in a new tab before calling
  // this — here we just log the manual application so it shows up in application history.
  // resumeId is optional per the /api/jobs/apply contract, so we no longer block on having one.
  const handleApplyJob = async (job: any) => {
    if (!backendUser?.id) return;
    if (!backendUser.isEmailVerified) {
      toast({
        title: "Email verification required",
        description: "Please verify your email to log applications.",
        variant: "destructive",
      });
      return;
    }
    const jobId = job.id || job.jobId;
    if (!jobId) {
      toast({ title: "Error", description: "Job ID missing", variant: "destructive" });
      return;
    }
    setApplyingJobId(String(jobId));
    try {
      await jobAPI.applyToJob(String(jobId), backendUser.id.toString(), effectiveResumeId || undefined);
      toast({ title: "Application logged", description: `Marked ${job.title} as applied` });
    } catch (e: any) {
      toast({
        title: "Couldn't log application",
        description: e?.message || "Could not record this application",
        variant: "destructive",
      });
    } finally {
      setApplyingJobId(null);
    }
  };

  if (loading) return <LoadingCard text="Loading job matches..." />;
  if (!backendUser) return <LoadingCard text="Please log in to view job matches..." />;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Job Matches
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Find jobs that match your resume and preferences
          </p>
          <EmailVerificationBanner
            className="mt-4"
            message="Please verify your email to apply to jobs. Searching, matching, and saving stay available either way."
          />
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="space-y-6">
            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
              <CardHeader>
                <CardTitle>Search Jobs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="keywords">Keywords</Label>
                  <Input
                    id="keywords"
                    placeholder="e.g., React Developer"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    placeholder="e.g., Bangalore"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
                <Button onClick={handleSearch} className="w-full" disabled={searchLoading}>
                  {searchLoading ? "Searching..." : "Search Jobs"}
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
              <CardHeader>
                <CardTitle>Job Matching</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="resumeId">Resume ID (optional)</Label>
                  <Input
                    id="resumeId"
                    placeholder={effectiveResumeId || "Uses latest resume if empty"}
                    value={resumeId}
                    onChange={(e) => setResumeId(e.target.value)}
                  />
                  {Array.isArray(resumes) && resumes.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Latest resume: {resumes[0].originalFileName || resumes[0].fileName} (#{resumes[0].id})
                    </p>
                  )}
                </div>
                <Button 
                  onClick={handleGenerateMatches} 
                  className="w-full" 
                  disabled={matchesLoading}
                >
                  {matchesLoading ? "Generating..." : "Generate Matches"}
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-6">
            {searchResults.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                  Search Results ({searchResults.length})
                </h2>
                <div className="space-y-4">
                  {searchResults.map((job: any) => (
                    <JobMatchCard
                      key={job.id || job.jobId}
                      job={job}
                      onApply={() => handleApplyJob(job)}
                      onSave={() => handleSaveJob(job)}
                      saving={savingJobId === String(job.id || job.jobId)}
                      applying={applyingJobId === String(job.id || job.jobId)}
                    />
                  ))}
                </div>
              </div>
            )}

            {jobMatches.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                  Keyword Matches ({jobMatches.length})
                </h2>
                <div className="space-y-4">
                  {jobMatches.map((job: any) => (
                    <JobMatchCard
                      key={job.id || job.jobId}
                      job={job}
                      onApply={() => handleApplyJob(job)}
                      onSave={() => handleSaveJob(job)}
                      saving={savingJobId === String(job.id || job.jobId)}
                      applying={applyingJobId === String(job.id || job.jobId)}
                    />
                  ))}
                </div>
              </div>
            )}

            {searchResults.length === 0 && jobMatches.length === 0 && (
              <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
                <CardContent className="text-center py-12">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    No jobs found
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    Search for jobs or generate AI matches to see results here
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
