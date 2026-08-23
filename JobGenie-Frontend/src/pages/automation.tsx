import {useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Badge} from "@/components/ui/badge";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {useToast} from "@/hooks/use-toast";
import {apiRequest} from "@/lib/queryClient";
import Navigation from "@/components/navigation";
import LocationSearch from "@/components/location-search";
import {extractSkillsFromResume, formatSkillsForJobSearch} from "@/services/skillExtractor";
import {resumeAPI} from "@/lib/api";
import {useAuth} from "@/context/AuthContext";
import EmailVerificationBanner from "@/components/EmailVerificationBanner";

export default function Automation() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { backendUser } = useAuth();

  const [selectedResumeId, setSelectedResumeId] = useState<number | null>(null);
  const [frequency, setFrequency] = useState("daily");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [maxApplications, setMaxApplications] = useState(5);
  const [keywords, setKeywords] = useState("");
  const [preferredLocations, setPreferredLocations] = useState<string[]>([]);
  const [salaryMin, setSalaryMin] = useState("500000");
  const [salaryMax, setSalaryMax] = useState("1500000");
  const [salaryCurrency, setSalaryCurrency] = useState("INR");
  const [experienceLevel, setExperienceLevel] = useState("mid");
  const [jobType, setJobType] = useState("full-time");
  const [remotePreference, setRemotePreference] = useState("any");
  const [isExtractingSkills, setIsExtractingSkills] = useState(false);

  // Platform credentials
  const [credentials, setCredentials] = useState({
    linkedin: { username: "", password: "" },
    indeed: { username: "", password: "" },
    naukri: { username: "", password: "" },
  });

  const { data: resumes = [] } = useQuery({
    queryKey: ["resumes", backendUser?.id],
    queryFn: async () => {
      if (!backendUser?.id) return [];
      return resumeAPI.getUserResumes(backendUser.id);
    },
    enabled: !!backendUser?.id,
  });

  const { data: schedules = [] } = useQuery({
    // Without userId this hit AutomationController's default "?userId=default" branch and
    // returned some other (nonexistent) user's schedules instead of the logged-in user's.
    queryKey: [`/api/automation/schedules?userId=${backendUser?.id ?? ""}`],
    enabled: !!backendUser?.id,
  });

  const createScheduleMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("/api/automation/schedule-advanced", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      // Match by prefix since the query key now carries ?userId=... (see schedules useQuery above).
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" &&
          (query.queryKey[0] as string).startsWith("/api/automation/schedules"),
      });
      toast({
        title: "Automation Scheduled",
        description: "Your job search automation has been set up successfully",
      });
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Setup Failed",
        description: error.message || "Failed to set up automation",
        variant: "destructive",
      });
    },
  });

  const runScheduleMutation = useMutation({
    mutationFn: async (scheduleId: number) => {
      return await apiRequest(`/api/automation/run-advanced/${scheduleId}`, {
        method: "POST",
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Automation Complete",
        description: `Found ${data.jobsFound} jobs, submitted ${data.applicationsSubmitted} applications`,
      });
      // Match by prefix since the query key now carries ?userId=... (see schedules useQuery above).
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" &&
          (query.queryKey[0] as string).startsWith("/api/automation/schedules"),
      });
    },
    onError: (error: any) => {
      toast({
        title: "Automation Failed",
        description: error.message || "Failed to run automation",
        variant: "destructive",
      });
    },
  });

  const runBrowserBotMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("/api/automation/browser-automation", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Browser Bot Complete",
        description: `Successfully applied to ${data.applicationsSubmitted} jobs across ${platforms.length} platforms`,
      });
      // Match by prefix since the query key now carries ?userId=... (see schedules useQuery above).
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" &&
          (query.queryKey[0] as string).startsWith("/api/automation/schedules"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
    onError: (error: any) => {
      toast({
        title: "Browser Bot Failed",
        description: error.message || "Failed to run browser automation",
        variant: "destructive",
      });
    },
  });

  // Auto-extract skills from selected resume
  const handleResumeSkillExtraction = async (resumeId: number) => {
    if (!resumes.length || isExtractingSkills) return;
    
    setIsExtractingSkills(true);
    try {
      const selectedResume = resumes.find((r: any) => r.id === resumeId);
      if (selectedResume && selectedResume.content) {
        const analysis = await extractSkillsFromResume(selectedResume.content, resumeId.toString());
        const skillsString = formatSkillsForJobSearch(analysis);
        
        setKeywords(skillsString);
        setPreferredLocations(["Bengaluru", "Mumbai", "Delhi"]);

        toast({
          title: "Skills Extracted Successfully",
          description: `Found ${skillsString.split(',').length} relevant skills and set Indian tech hubs as locations`,
        });
      }
    } catch (error) {
      toast({
        title: "Skill Extraction Failed",
        description: "Unable to extract skills. You can manually enter them.",
        variant: "destructive",
      });
    } finally {
      setIsExtractingSkills(false);
    }
  };

  // Handle currency change when location is selected
  const handleCurrencyChange = (currency: string, symbol: string) => {
    setSalaryCurrency(currency);
    toast({
      title: "Currency Updated",
      description: `Salary currency changed to ${currency} (${symbol})`,
    });
  };

  const resetForm = () => {
    setSelectedResumeId(null);
    setFrequency("daily");
    setPlatforms([]);
    setMaxApplications(5);
    setKeywords("");
    setPreferredLocations([]);
    setSalaryMin("500000");
    setSalaryMax("1500000");
    setSalaryCurrency("INR");
    setCredentials({
      linkedin: { username: "", password: "" },
      indeed: { username: "", password: "" },
      naukri: { username: "", password: "" },
    });
  };

  const handlePlatformToggle = (platform: string) => {
    setPlatforms(prev => 
      prev.includes(platform) 
        ? prev.filter(p => p !== platform)
        : [...prev, platform]
    );
  };

  const handleCredentialChange = (platform: string, field: string, value: string) => {
    setCredentials(prev => ({
      ...prev,
      [platform]: {
        ...prev[platform as keyof typeof prev],
        [field]: value
      }
    }));
  };

  const handleCreateSchedule = () => {
    if (!backendUser?.isEmailVerified) {
      toast({
        title: "Email verification required",
        description: "Please verify your email to use this feature.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedResumeId || platforms.length === 0) {
      toast({
        title: "Missing Information",
        description: "Please select a resume and at least one platform",
        variant: "destructive",
      });
      return;
    }

    // Validate credentials for selected platforms
    const missingCredentials = platforms.filter(platform => {
      const creds = credentials[platform as keyof typeof credentials];
      return !creds.username || !creds.password;
    });

    if (missingCredentials.length > 0) {
      toast({
        title: "Missing Credentials",
        description: `Please provide credentials for: ${missingCredentials.join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    const jobPreferences = {
      keywords: keywords.split(',').map(k => k.trim()).filter(k => k),
      locations: preferredLocations,
      salaryMin: salaryMin ? parseInt(salaryMin) : undefined,
      salaryMax: salaryMax ? parseInt(salaryMax) : undefined,
      currency: salaryCurrency,
      experienceLevel,
      jobType,
      remotePreference,
    };

    const platformCredentials = platforms.reduce((acc, platform) => {
      acc[platform] = credentials[platform as keyof typeof credentials];
      return acc;
    }, {} as any);

    createScheduleMutation.mutate({
      resumeId: selectedResumeId,
      frequency,
      platforms,
      jobPreferences,
      platformCredentials,
      maxApplicationsPerRun: maxApplications,
    });
  };

  const handleRunBrowserBotNow = () => {
    if (!backendUser?.isEmailVerified) {
      toast({
        title: "Email verification required",
        description: "Please verify your email to use this feature.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedResumeId || platforms.length === 0) {
      toast({
        title: "Missing Information",
        description: "Please select a resume and at least one platform",
        variant: "destructive",
      });
      return;
    }

    // Validate credentials for selected platforms
    const missingCredentials = platforms.filter(platform => {
      const creds = credentials[platform as keyof typeof credentials];
      return !creds.username || !creds.password;
    });

    if (missingCredentials.length > 0) {
      toast({
        title: "Missing Credentials",
        description: `Please provide credentials for: ${missingCredentials.join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    const searchCriteria = {
      keywords: keywords.split(',').map(k => k.trim()).filter(k => k),
      location: preferredLocations,
      salaryMin: salaryMin ? parseInt(salaryMin) : undefined,
      salaryMax: salaryMax ? parseInt(salaryMax) : undefined,
      experienceLevel,
      jobType,
      remotePreference,
    };

    const platformCredentials = platforms.reduce((acc, platform) => {
      acc[platform] = credentials[platform as keyof typeof credentials];
      return acc;
    }, {} as any);

    runBrowserBotMutation.mutate({
      resumeId: selectedResumeId,
      platforms,
      searchCriteria,
      platformCredentials,
      maxApplications,
    });
  };

  const formatNextRun = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((date.getTime() - now.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 60) return `in ${diffInMinutes}m`;
    if (diffInMinutes < 1440) return `in ${Math.floor(diffInMinutes / 60)}h`;
    return `in ${Math.floor(diffInMinutes / 1440)}d`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <i className="fas fa-robot mr-3 text-primary-600"></i>
            Job Search Automation
          </h1>
          <p className="text-gray-600 mt-2">
            Set up automated job searching and application submission across multiple platforms
          </p>

          <EmailVerificationBanner
            className="mt-4"
            message="Please verify your email to run automation or submit applications. You can still browse and configure a search below."
          />

          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2 flex items-center">
              <i className="fas fa-info-circle mr-2"></i>
              How Browser Automation Works
            </h3>
            <div className="text-sm text-blue-800 space-y-2">
              <p>• <strong>Real Browser Bot:</strong> Opens actual web browsers and navigates to job platforms like a human would</p>
              <p>• <strong>Auto Login:</strong> Uses your credentials to log into Naukri, Indeed, LinkedIn automatically</p>
              <p>• <strong>Smart Job Search:</strong> Searches for jobs based on your resume keywords and preferences</p>
              <p>• <strong>Auto Apply:</strong> Fills and submits job applications using your resume data</p>
              <p>• <strong>Real-time Updates:</strong> Get notifications for each successful application</p>
              <div className="mt-3 p-2 bg-blue-100 rounded">
                <p className="font-medium">🚀 "Run Browser Bot Now" starts immediately</p>
                <p className="font-medium">📅 "Schedule Automation" runs daily at your preferred time</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Setup Form */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <i className="fas fa-cog mr-2 text-primary-600"></i>
                  Automation Setup
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="resume-select">Select Resume</Label>
                  <select
                    id="resume-select"
                    className="w-full mt-1 p-2 border border-gray-300 rounded-md"
                    value={selectedResumeId || ""}
                    onChange={(e) => setSelectedResumeId(Number(e.target.value) || null)}
                  >
                    <option value="">Choose a resume...</option>
                    {(resumes as any[]).map((resume: any) => (
                      <option key={resume.id} value={resume.id}>
                        {resume.fileName} - {resume.fullName || 'Unnamed'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label>Job Platforms</Label>
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    {['linkedin', 'indeed', 'naukri'].map((platform) => (
                      <div
                        key={platform}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          platforms.includes(platform)
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => handlePlatformToggle(platform)}
                      >
                        <div className="text-center">
                          <i className={`fab fa-${platform} text-2xl mb-1`}></i>
                          <p className="text-sm font-medium capitalize">{platform}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Frequency</Label>
                    <select
                      className="w-full mt-1 p-2 border border-gray-300 rounded-md"
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value)}
                    >
                      <option value="hourly">Every Hour</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                  <div>
                    <Label>Max Applications per Run</Label>
                    <Input
                      type="number"
                      value={maxApplications}
                      onChange={(e) => setMaxApplications(Number(e.target.value))}
                      min="1"
                      max="20"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Platform Credentials */}
            {platforms.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <i className="fas fa-key mr-2 text-orange-600"></i>
                    Platform Credentials
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Alert>
                    <i className="fas fa-shield-alt mr-2"></i>
                    <AlertDescription>
                      Your credentials are sent only for this automation run and are not saved to our
                      database. Browser automation is not enabled in this deployment.
                    </AlertDescription>
                  </Alert>

                  {platforms.map((platform) => (
                    <div key={platform} className="border border-gray-200 rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 mb-3 capitalize flex items-center">
                        <i className={`fab fa-${platform} mr-2`}></i>
                        {platform} Credentials
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Username/Email</Label>
                          <Input
                            type="text"
                            value={credentials[platform as keyof typeof credentials].username}
                            onChange={(e) => handleCredentialChange(platform, 'username', e.target.value)}
                            placeholder="your@email.com"
                          />
                        </div>
                        <div>
                          <Label>Password</Label>
                          <Input
                            type="password"
                            value={credentials[platform as keyof typeof credentials].password}
                            onChange={(e) => handleCredentialChange(platform, 'password', e.target.value)}
                            placeholder="••••••••"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Job Preferences */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <i className="fas fa-filter mr-2 text-primary-600"></i>
                  Job Search Criteria
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Keywords (comma-separated)</Label>
                  <div className="space-y-2">
                    <Input
                      value={keywords}
                      onChange={(e) => setKeywords(e.target.value)}
                      placeholder="React, Node.js, TypeScript, AWS"
                    />
                    {resumes && resumes.length > 0 && (
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => selectedResumeId && handleResumeSkillExtraction(selectedResumeId)}
                          disabled={!selectedResumeId || isExtractingSkills}
                        >
                          {isExtractingSkills ? "Extracting..." : "Extract from Resume"}
                        </Button>
                        {isExtractingSkills && (
                          <span className="text-sm text-muted-foreground">Analyzing skills...</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <Label>Preferred Locations</Label>
                  <LocationSearch
                    selectedLocations={preferredLocations}
                    onLocationAdd={(location) => setPreferredLocations(prev => [...prev, location])}
                    onLocationRemove={(location) => setPreferredLocations(prev => prev.filter(loc => loc !== location))}
                    onCurrencyChange={handleCurrencyChange}
                    placeholder="Search cities worldwide (e.g. New York, London, Bengaluru)"
                    maxLocations={5}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Min Salary ({salaryCurrency === 'INR' ? '₹' : salaryCurrency === 'USD' ? '$' : salaryCurrency === 'EUR' ? '€' : salaryCurrency === 'GBP' ? '£' : salaryCurrency})</Label>
                    <Input
                      type="number"
                      value={salaryMin}
                      onChange={(e) => setSalaryMin(e.target.value)}
                      placeholder={salaryCurrency === 'INR' ? "500000" : "80000"}
                    />
                  </div>
                  <div>
                    <Label>Max Salary ({salaryCurrency === 'INR' ? '₹' : salaryCurrency === 'USD' ? '$' : salaryCurrency === 'EUR' ? '€' : salaryCurrency === 'GBP' ? '£' : salaryCurrency})</Label>
                    <Input
                      type="number"
                      value={salaryMax}
                      onChange={(e) => setSalaryMax(e.target.value)}
                      placeholder={salaryCurrency === 'INR' ? "1500000" : "150000"}
                    />
                  </div>
                  <div>
                    <Label>Currency</Label>
                    <select
                      className="w-full mt-1 p-2 border border-gray-300 rounded-md"
                      value={salaryCurrency}
                      onChange={(e) => setSalaryCurrency(e.target.value)}
                    >
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="CAD">CAD (C$)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Experience Level</Label>
                    <select
                      className="w-full mt-1 p-2 border border-gray-300 rounded-md"
                      value={experienceLevel}
                      onChange={(e) => setExperienceLevel(e.target.value)}
                    >
                      <option value="entry">Entry Level</option>
                      <option value="mid">Mid Level</option>
                      <option value="senior">Senior Level</option>
                      <option value="executive">Executive</option>
                    </select>
                  </div>
                  <div>
                    <Label>Job Type</Label>
                    <select
                      className="w-full mt-1 p-2 border border-gray-300 rounded-md"
                      value={jobType}
                      onChange={(e) => setJobType(e.target.value)}
                    >
                      <option value="full-time">Full-time</option>
                      <option value="part-time">Part-time</option>
                      <option value="contract">Contract</option>
                      <option value="freelance">Freelance</option>
                    </select>
                  </div>
                  <div>
                    <Label>Remote</Label>
                    <select
                      className="w-full mt-1 p-2 border border-gray-300 rounded-md"
                      value={remotePreference}
                      onChange={(e) => setRemotePreference(e.target.value)}
                    >
                      <option value="remote-only">Remote Only</option>
                      <option value="hybrid">Hybrid</option>
                      <option value="on-site">On-site</option>
                      <option value="any">Any</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-3">
                  <Button
                    onClick={handleRunBrowserBotNow}
                    disabled={
                      runBrowserBotMutation.isPending ||
                      !selectedResumeId ||
                      platforms.length === 0 ||
                      !backendUser?.isEmailVerified
                    }
                    className="w-full bg-orange-600 hover:bg-orange-700"
                  >
                    {runBrowserBotMutation.isPending ? (
                      <>
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        Running Browser Bot...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-rocket mr-2"></i>
                        Run Browser Bot Now
                      </>
                    )}
                  </Button>
                  
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white px-2 text-muted-foreground">or</span>
                    </div>
                  </div>

                  <Button
                    onClick={handleCreateSchedule}
                    disabled={createScheduleMutation.isPending || !backendUser?.isEmailVerified}
                    className="w-full bg-primary-600 hover:bg-primary-700"
                    variant="outline"
                  >
                    {createScheduleMutation.isPending ? (
                      <>
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        Setting up schedule...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-calendar mr-2"></i>
                        Schedule Automation
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Active Schedules */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <i className="fas fa-clock mr-2 text-primary-600"></i>
                  Active Automations
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(schedules as any[]).length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <i className="fas fa-robot text-4xl mb-4"></i>
                    <p>No automations configured</p>
                    <p className="text-sm">Set up your first automated job search</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(schedules as any[]).map((schedule: any) => (
                      <div
                        key={schedule.id}
                        className="border border-gray-200 rounded-lg p-4"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            <Badge
                              variant={schedule.isActive ? "default" : "secondary"}
                            >
                              {schedule.isActive ? "Active" : "Paused"}
                            </Badge>
                            <span className="text-sm text-gray-600 capitalize">
                              {schedule.frequency}
                            </span>
                          </div>
                          <div className="flex space-x-2">
                            <Button
                              onClick={() => runScheduleMutation.mutate(schedule.id)}
                              disabled={runScheduleMutation.isPending}
                              size="sm"
                              variant="outline"
                            >
                              <i className="fas fa-play mr-1"></i>
                              Run Now
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Platforms:</span>
                            <div className="flex space-x-1">
                              {schedule.platforms.map((platform: string) => (
                                <Badge key={platform} variant="outline" className="text-xs">
                                  {platform}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Next run:</span>
                            <span className="font-medium">
                              {formatNextRun(schedule.nextRunAt)}
                            </span>
                          </div>

                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Last result:</span>
                            <span>
                              {schedule.lastJobsFound || 0} jobs, {schedule.lastApplicationsSubmitted || 0} applied
                            </span>
                          </div>

                          {schedule.jobPreferences?.keywords && (
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Keywords:</span>
                              <span className="text-right max-w-xs truncate">
                                {schedule.jobPreferences.keywords.slice(0, 3).join(", ")}
                                {schedule.jobPreferences.keywords.length > 3 && "..."}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}