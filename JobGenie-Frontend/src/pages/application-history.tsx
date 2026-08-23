import {useQuery} from "@tanstack/react-query";
import Navigation from "@/components/navigation";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {jobAPI} from "@/lib/api";
import {useAuth} from "@/context/AuthContext";
import {LoadingCard} from "@/components/ui/loading-spinner";
import {Link} from "wouter";

export default function ApplicationHistory() {
  const { backendUser, loading } = useAuth();

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["applications", backendUser?.id],
    queryFn: async () => {
      if (!backendUser?.id) return [];
      return jobAPI.getUserApplications(backendUser.id.toString(), 1, 50);
    },
    enabled: !!backendUser?.id,
  });

  const { data: savedJobs = [], isLoading: savedLoading } = useQuery({
    queryKey: ["saved-jobs", backendUser?.id],
    queryFn: async () => {
      if (!backendUser?.id) return [];
      return jobAPI.getSavedJobs(backendUser.id.toString());
    },
    enabled: !!backendUser?.id,
  });

  if (loading || isLoading || savedLoading) {
    return <LoadingCard text="Loading history..." />;
  }

  if (!backendUser) {
    return <LoadingCard text="Please log in to view application history..." />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <Navigation />
      <div className="container mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Application History
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Track applications and saved jobs
            </p>
          </div>
          <Link href="/job-matches">
            <Button>Find More Jobs</Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Applications ({Array.isArray(applications) ? applications.length : 0})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!Array.isArray(applications) || applications.length === 0 ? (
              <p className="text-gray-500">No applications yet.</p>
            ) : (
              applications.map((app: any) => (
                <div
                  key={app.id || `${app.jobId}-${app.appliedAt}`}
                  className="flex items-center justify-between border-b border-gray-100 py-3"
                >
                  <div>
                    <p className="font-medium">Job #{app.jobId}</p>
                    <p className="text-sm text-gray-500">
                      {app.platform || "Unknown platform"} · {app.appliedAt || "—"}
                    </p>
                  </div>
                  <Badge>{app.status || "APPLIED"}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Saved Jobs ({Array.isArray(savedJobs) ? savedJobs.length : 0})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!Array.isArray(savedJobs) || savedJobs.length === 0 ? (
              <p className="text-gray-500">No saved jobs yet.</p>
            ) : (
              savedJobs.map((job: any) => (
                <div
                  key={job.id || job.jobId}
                  className="flex items-center justify-between border-b border-gray-100 py-3"
                >
                  <div>
                    <p className="font-medium">{job.title || job.jobId}</p>
                    <p className="text-sm text-gray-500">
                      {job.company || "—"} · {job.location || "—"}
                    </p>
                  </div>
                  {job.matchScore != null && <Badge>{job.matchScore}% match</Badge>}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
