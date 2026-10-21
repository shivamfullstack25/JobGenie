import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import Navigation from "@/components/navigation";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {jobAPI} from "@/lib/api";
import {useAuth} from "@/context/AuthContext";
import {LoadingCard} from "@/components/ui/loading-spinner";
import {useToast} from "@/hooks/use-toast";
import {Link} from "wouter";

// Application tracker statuses (job-service's PATCH /api/jobs/applications/{id}/status
// validates against exactly these, case-insensitive, normalized to uppercase server-side).
// Each gets a distinct badge treatment so the history list reads at a glance.
const APPLICATION_STATUSES = [
  "SHORTLISTED",
  "PREPARING",
  "AWAITING_APPROVAL",
  "READY_TO_SUBMIT",
  "SUBMITTED",
  "SCREENING",
  "INTERVIEW",
  "TECHNICAL_ROUND",
  "HR_ROUND",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
  "CLOSED",
] as const;

// Older rows use APPLIED / INTERVIEWING; they are the same states as SUBMITTED / INTERVIEW.
const ALIASES: Record<string, string> = { APPLIED: "SUBMITTED", INTERVIEWING: "INTERVIEW" };
const canonicalStatus = (status: string) => ALIASES[status?.toUpperCase()] ?? status?.toUpperCase();

const STATUS_BADGE_CLASSES: Record<string, string> = {
  SHORTLISTED: "bg-gray-100 text-gray-800 border-gray-200",
  PREPARING: "bg-gray-100 text-gray-800 border-gray-200",
  AWAITING_APPROVAL: "bg-amber-100 text-amber-800 border-amber-200",
  READY_TO_SUBMIT: "bg-amber-100 text-amber-800 border-amber-200",
  SUBMITTED: "bg-blue-50 text-blue-800 border-blue-200",
  SCREENING: "bg-blue-100 text-blue-800 border-blue-200",
  INTERVIEW: "bg-blue-100 text-blue-800 border-blue-200",
  TECHNICAL_ROUND: "bg-indigo-100 text-indigo-800 border-indigo-200",
  HR_ROUND: "bg-indigo-100 text-indigo-800 border-indigo-200",
  OFFER: "bg-green-100 text-green-800 border-green-200",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
  WITHDRAWN: "bg-gray-100 text-gray-500 border-gray-200",
  CLOSED: "bg-gray-100 text-gray-500 border-gray-200",
  ERROR: "bg-red-100 text-red-800 border-red-200",
};

const STATUS_LABELS: Record<string, string> = {
  SHORTLISTED: "Shortlisted",
  PREPARING: "Preparing",
  AWAITING_APPROVAL: "Awaiting approval",
  READY_TO_SUBMIT: "Ready to submit",
  SUBMITTED: "Applied",
  SCREENING: "Screening",
  INTERVIEW: "Interview",
  TECHNICAL_ROUND: "Technical round",
  HR_ROUND: "HR round",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  CLOSED: "Closed",
  ERROR: "Error",
};

export default function ApplicationHistory() {
  const { backendUser, loading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["applications", backendUser?.id],
    queryFn: async () => {
      if (!backendUser?.id) return [];
      return jobAPI.getUserApplications(backendUser.id.toString(), 1, 50);
    },
    enabled: !!backendUser?.id,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      applicationId,
      status,
    }: {
      applicationId: string | number;
      status: string;
    }) => {
      if (!backendUser?.id) throw new Error("Not logged in");
      return jobAPI.updateApplicationStatus(applicationId, backendUser.id, status);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["applications", backendUser?.id] });
      toast({
        title: "Status updated",
        description: `Marked as ${STATUS_LABELS[variables.status] || variables.status}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't update status",
        description: error?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
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
              applications.map((app: any) => {
                const currentStatus = canonicalStatus(app.status || "APPLIED");
                const isUpdating =
                  updateStatusMutation.isPending &&
                  updateStatusMutation.variables?.applicationId === app.id;
                return (
                  <div
                    key={app.id || `${app.jobId}-${app.appliedAt}`}
                    className="flex items-center justify-between border-b border-gray-100 py-3 gap-4"
                  >
                    <div>
                      <p className="font-medium">Job #{app.jobId}</p>
                      <p className="text-sm text-gray-500">
                        {app.platform || "Unknown platform"} · {app.appliedAt || "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        className={
                          STATUS_BADGE_CLASSES[currentStatus] ||
                          STATUS_BADGE_CLASSES.SUBMITTED
                        }
                      >
                        {STATUS_LABELS[currentStatus] || currentStatus}
                      </Badge>
                      <Select
                        value={currentStatus}
                        disabled={isUpdating || !app.id}
                        onValueChange={(value) => {
                          if (!app.id || value === currentStatus) return;
                          updateStatusMutation.mutate({
                            applicationId: app.id,
                            status: value,
                          });
                        }}
                      >
                        <SelectTrigger className="w-[160px] h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {APPLICATION_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              {STATUS_LABELS[status]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })
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
