import {useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Switch} from "@/components/ui/switch";
import {Badge} from "@/components/ui/badge";
import {useToast} from "@/hooks/use-toast";
import {apiRequest} from "@/lib/queryClient";
import jsPDF from 'jspdf';

interface AutomationSchedulerProps {
  resumes: Array<{
    id: number;
    fileName: string;
    isProcessed: boolean;
  }>;
}

export default function AutomationScheduler({ resumes }: AutomationSchedulerProps) {
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");
  const [frequency, setFrequency] = useState("daily");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [location, setLocation] = useState("");
  const [remote, setRemote] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [jobUrl, setJobUrl] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [autoApply, setAutoApply] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: schedules = [] } = useQuery({
    queryKey: ["/api/automation/schedules"],
  }) as { data: any[] };

  const createScheduleMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/automation/schedule", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automation/schedules"] });
      resetForm();
      setIsCreating(false);
      toast({
        title: "Schedule Created",
        description: "Automated job search has been set up successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Schedule Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleScheduleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      return await apiRequest("PATCH", `/api/automation/schedules/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automation/schedules"] });
      toast({
        title: "Schedule Updated",
        description: "Automation schedule has been updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const runNowMutation = useMutation({
    mutationFn: async (scheduleId: number) => {
      const response = await apiRequest("POST", `/api/automation/run/${scheduleId}`, {});
      return await response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Job Search Complete",
        description: `Found ${data.jobsFound} jobs — review and apply from your matches.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/job-applications"] });
    },
    onError: (error) => {
      toast({
        title: "Search Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handlePlatformToggle = (platform: string) => {
    setPlatforms(prev => 
      prev.includes(platform) 
        ? prev.filter(p => p !== platform)
        : [...prev, platform]
    );
  };

  const handleCreateSchedule = () => {
    if (!selectedResumeId || platforms.length === 0) {
      toast({
        title: "Missing Information",
        description: "Please select a resume and at least one platform.",
        variant: "destructive",
      });
      return;
    }

    const jobPreferences = {
      salaryMin: salaryMin ? parseInt(salaryMin) : undefined,
      salaryMax: salaryMax ? parseInt(salaryMax) : undefined,
      location: location || undefined,
      remote,
    };

    createScheduleMutation.mutate({
      resumeId: parseInt(selectedResumeId),
      frequency,
      platforms,
      jobPreferences,
    });
  };

  const resetForm = () => {
    setSelectedResumeId("");
    setFrequency("daily");
    setPlatforms([]);
    setSalaryMin("");
    setSalaryMax("");
    setLocation("");
    setRemote(false);
    setJobUrl("");
    setScheduleTime("");
    setAutoApply(false);
  };

  const processedResumes = resumes.filter(resume => resume.isProcessed);
  const availablePlatforms = [
    { id: "linkedin", name: "LinkedIn", icon: "fab fa-linkedin" },
    { id: "indeed", name: "Indeed", icon: "fas fa-briefcase" },
    { id: "naukri", name: "Naukri.com", icon: "fas fa-globe" },
    { id: "glassdoor", name: "Glassdoor", icon: "fas fa-building" },
  ];

  const handleScheduleJob = () => {
    if (!selectedResumeId || !jobUrl || !scheduleTime) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    scheduleMutation.mutate({
      resumeId: selectedResumeId,
      jobUrl,
      scheduleTime,
      autoApply: autoApply,
    });
  };

  const exportToPDF = () => {
    if (scheduledJobs.length === 0) return;
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const maxWidth = pageWidth - 2 * margin;
    
    // Add title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Automation Scheduler Report', pageWidth / 2, 30, { align: 'center' });
    
    // Add info
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, 50);
    doc.text(`Total Scheduled Jobs: ${scheduledJobs.length}`, margin, 60);
    
    // Add jobs
    doc.setFontSize(11);
    let yPosition = 80;
    
    scheduledJobs.forEach((job, index) => {
      if (yPosition > 250) {
        doc.addPage();
        yPosition = 30;
      }
      
      doc.setFont('helvetica', 'bold');
      doc.text(`Job ${index + 1}:`, margin, yPosition);
      yPosition += 8;
      
      doc.setFont('helvetica', 'normal');
      doc.text(`Resume: ${job.resumeName}`, margin, yPosition);
      yPosition += 6;
      doc.text(`Job URL: ${job.jobUrl}`, margin, yPosition);
      yPosition += 6;
      doc.text(`Scheduled: ${job.scheduleTime}`, margin, yPosition);
      yPosition += 6;
      doc.text(`Auto Apply: ${job.autoApply ? 'Yes' : 'No'}`, margin, yPosition);
      yPosition += 15;
    });
    
    // Save PDF
    doc.save(`automation-scheduler-report.pdf`);
    
    toast({
      title: "PDF Exported",
      description: "Automation schedule has been exported as PDF.",
    });
  };

  const exportToJSON = () => {
    if (scheduledJobs.length === 0) return;
    
    const data = {
      scheduledJobs,
      generatedAt: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `automation-scheduler-report.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "JSON Exported",
      description: "Automation schedule data has been exported as JSON.",
    });
  };

  return (
    <div className="space-y-6">
      {/* Existing Schedules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center">
              <i className="fas fa-robot mr-2 text-primary-600"></i>
              Active Job Search Automations ({schedules.length})
            </span>
            {schedules.length > 0 && (
              <div className="flex space-x-2">
                <Button variant="outline" size="sm" onClick={exportToPDF}>
                  <i className="fas fa-file-pdf mr-1"></i>
                  PDF
                </Button>
                <Button variant="outline" size="sm" onClick={exportToJSON}>
                  <i className="fas fa-file-code mr-1"></i>
                  JSON
                </Button>
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {schedules.length === 0 ? (
            <div className="text-center py-8">
              <i className="fas fa-robot text-4xl text-gray-300 mb-4"></i>
              <p className="text-gray-500 mb-4">No automated job searches set up yet.</p>
              <Button 
                onClick={() => setIsCreating(true)}
                className="bg-primary-600 hover:bg-primary-700"
              >
                <i className="fas fa-plus mr-2"></i>
                Create First Automation
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {(schedules as any[]).map((schedule: any) => (
                <div key={schedule.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h4 className="font-semibold text-gray-900">
                          {schedule.frequency.charAt(0).toUpperCase() + schedule.frequency.slice(1)} Job Search
                        </h4>
                        <Badge variant={schedule.isActive ? "default" : "secondary"}>
                          {schedule.isActive ? "Active" : "Paused"}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">
                        Platforms: {schedule.platforms.join(", ")}
                      </p>
                      <p className="text-xs text-gray-500">
                        Next run: {schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleString() : "Not scheduled"}
                      </p>
                      {schedule.lastRunAt && (
                        <p className="text-xs text-gray-500">
                          Last run: {new Date(schedule.lastRunAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={schedule.isActive}
                        onCheckedChange={(checked) => 
                          toggleScheduleMutation.mutate({ id: schedule.id, isActive: checked })
                        }
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => runNowMutation.mutate(schedule.id)}
                        disabled={runNowMutation.isPending}
                      >
                        {runNowMutation.isPending ? (
                          <i className="fas fa-spinner fa-spin"></i>
                        ) : (
                          <>
                            <i className="fas fa-play mr-1"></i>
                            Run Now
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              <Button 
                variant="outline"
                onClick={() => setIsCreating(true)}
                className="w-full"
              >
                <i className="fas fa-plus mr-2"></i>
                Add Another Schedule
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create New Schedule */}
      {isCreating && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>
                <i className="fas fa-calendar-plus mr-2 text-primary-600"></i>
                Set Up Automated Job Search
              </span>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  setIsCreating(false);
                  resetForm();
                }}
              >
                <i className="fas fa-times"></i>
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="resume-select">Select Resume</Label>
              <Select value={selectedResumeId} onValueChange={setSelectedResumeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a resume for job matching" />
                </SelectTrigger>
                <SelectContent>
                  {processedResumes.map((resume) => (
                    <SelectItem key={resume.id} value={resume.id.toString()}>
                      {resume.fileName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Job Search Frequency</Label>
              <div className="flex space-x-2 mt-2">
                {["daily", "weekly"].map((freq) => (
                  <Button
                    key={freq}
                    variant={frequency === freq ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFrequency(freq)}
                    className={frequency === freq ? "bg-primary-600 hover:bg-primary-700" : ""}
                  >
                    {freq.charAt(0).toUpperCase() + freq.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label>Job Platforms</Label>
              <div className="grid grid-cols-2 gap-3 mt-2">
                {availablePlatforms.map((platform) => (
                  <Button
                    key={platform.id}
                    variant={platforms.includes(platform.id) ? "default" : "outline"}
                    onClick={() => handlePlatformToggle(platform.id)}
                    className={`justify-start ${platforms.includes(platform.id) ? "bg-primary-600 hover:bg-primary-700" : ""}`}
                  >
                    <i className={`${platform.icon} mr-2`}></i>
                    {platform.name}
                  </Button>
                ))}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Select platforms to search for jobs on — JobGenie finds matches, you apply yourself on each site
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="salary-min">Minimum Salary (k)</Label>
                <Input
                  id="salary-min"
                  type="number"
                  value={salaryMin}
                  onChange={(e) => setSalaryMin(e.target.value)}
                  placeholder="e.g., 80"
                />
              </div>
              <div>
                <Label htmlFor="salary-max">Maximum Salary (k)</Label>
                <Input
                  id="salary-max"
                  type="number"
                  value={salaryMax}
                  onChange={(e) => setSalaryMax(e.target.value)}
                  placeholder="e.g., 120"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="location">Preferred Location</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., San Francisco, CA or leave blank for anywhere"
              />
            </div>

            <div className="flex items-center space-x-3">
              <Switch
                id="remote"
                checked={remote}
                onCheckedChange={setRemote}
              />
              <Label htmlFor="remote">Include remote opportunities</Label>
            </div>

            <div className="flex space-x-3">
              <Button 
                onClick={handleCreateSchedule}
                disabled={createScheduleMutation.isPending || processedResumes.length === 0}
                className="bg-primary-600 hover:bg-primary-700"
              >
                <i className="fas fa-magic mr-2"></i>
                {createScheduleMutation.isPending ? "Creating..." : "Start Automation"}
              </Button>
              <Button 
                variant="outline"
                onClick={() => {
                  setIsCreating(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
            </div>

            {processedResumes.length === 0 && (
              <p className="text-sm text-gray-500 text-center bg-yellow-50 p-3 rounded">
                Please upload and process a resume first to enable job automation.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}