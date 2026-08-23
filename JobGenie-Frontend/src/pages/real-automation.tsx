import {useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {apiRequest} from "@/lib/queryClient";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Switch} from "@/components/ui/switch";
import {Badge} from "@/components/ui/badge";
import {Separator} from "@/components/ui/separator";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Progress} from "@/components/ui/progress";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {useToast} from "@/hooks/use-toast";
import Navigation from "@/components/navigation";
import SchedulingInterface from "@/components/SchedulingInterface";
import {resumeAPI} from "@/lib/api";
import {useAuth} from "@/context/AuthContext";
import EmailVerificationBanner from "@/components/EmailVerificationBanner";
import {
    AlertTriangle,
    BarChart3,
    Bot,
    CheckCircle,
    Clock,
    Eye,
    EyeOff,
    Globe,
    Pause,
    Play,
    Plus,
    Settings,
    Shield,
    Target,
    Trash2,
    XCircle
} from "lucide-react";

interface JobPlatform {
  id: string;
  name: string;
  logo: string;
  enabled: boolean;
  credentials: {
    email: string;
    password: string;
  };
  verified: boolean;
}

interface AutomationPreferences {
  keywords: string[];
  location: string;
  experienceLevel: 'entry' | 'mid' | 'senior';
  jobType: 'full-time' | 'part-time' | 'contract' | 'internship';
  remotePreference: 'remote' | 'hybrid' | 'onsite' | 'any';
  salaryMin: number;
  salaryMax: number;
  maxApplicationsPerRun: number;
  autoApplyEnabled: boolean;
}

interface AutomationResult {
  platform: string;
  jobsFound: number;
  applicationsSubmitted: number;
  errors: string[];
  jobsApplied: Array<{
    title: string;
    company: string;
    url: string;
    status: 'applied' | 'failed';
  }>;
}

export default function RealAutomation() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { backendUser } = useAuth();
  
  const [platforms, setPlatforms] = useState<JobPlatform[]>([
    {
      id: 'indeed',
      name: 'Indeed',
      logo: '🔍',
      enabled: false,
      credentials: { email: '', password: '' },
      verified: false
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      logo: '💼',
      enabled: false,
      credentials: { email: '', password: '' },
      verified: false
    },
    {
      id: 'naukri',
      name: 'Naukri.com',
      logo: '🇮🇳',
      enabled: false,
      credentials: { email: '', password: '' },
      verified: false
    }
  ]);

  const [preferences, setPreferences] = useState<AutomationPreferences>({
    keywords: [],
    location: '',
    experienceLevel: 'mid',
    jobType: 'full-time',
    remotePreference: 'any',
    salaryMin: 0,
    salaryMax: 200000,
    maxApplicationsPerRun: 10,
    autoApplyEnabled: false
  });

  const [currentKeyword, setCurrentKeyword] = useState('');
  const [showPasswords, setShowPasswords] = useState<{[key: string]: boolean}>({});
  const [isRunning, setIsRunning] = useState(false);
  const [automationResults, setAutomationResults] = useState<AutomationResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [selectedResumeId, setSelectedResumeId] = useState<number | null>(null);

  // Get user's resumes
  const { data: resumes } = useQuery({
    queryKey: ["resumes", backendUser?.id],
    queryFn: async () => {
      if (!backendUser?.id) return [];
      return resumeAPI.getUserResumes(backendUser.id);
    },
    enabled: !!backendUser?.id,
  });

  // Get automation status
  const { data: automationStatus } = useQuery({
    queryKey: ["/api/automation/status"],
    refetchInterval: 5000,
  });

  // Test credentials mutation
  const testCredentialsMutation = useMutation({
    mutationFn: async ({ platform, email, password }: { platform: string; email: string; password: string }) => {
      return await apiRequest("/api/automation/test-credentials", {
        method: "POST",
        body: JSON.stringify({ platform, email, password }),
      });
    },
    onSuccess: (data: any, variables) => {
      const updatedPlatforms = platforms.map(p => 
        p.id === variables.platform 
          ? { ...p, verified: data.success }
          : p
      );
      setPlatforms(updatedPlatforms);
      
      toast({
        title: data.success ? "Credentials Verified" : "Verification Failed",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to test credentials",
        variant: "destructive",
      });
    },
  });

  // Run automation mutation
  const runAutomationMutation = useMutation({
    mutationFn: async () => {
      const enabledPlatforms = platforms.filter(p => p.enabled && p.verified);
      const credentials = enabledPlatforms.map(p => ({
        platform: p.id,
        email: p.credentials.email,
        password: p.credentials.password
      }));

      return await apiRequest("/api/automation/run-job-search", {
        method: "POST",
        body: JSON.stringify({
          credentials,
          preferences,
          resumeId: selectedResumeId
        }),
      });
    },
    onSuccess: (data: any) => {
      setAutomationResults(data.results);
      setIsRunning(false);
      setProgress(100);
      
      toast({
        title: "Automation Complete",
        description: `Found ${data.totalJobsFound} jobs, submitted ${data.totalApplicationsSubmitted} applications`,
      });
    },
    onError: (error: any) => {
      setIsRunning(false);
      setProgress(0);
      
      toast({
        title: "Automation Failed",
        description: error.message || "Failed to run automation",
        variant: "destructive",
      });
    },
  });

  const handleAddKeyword = () => {
    if (currentKeyword.trim() && !preferences.keywords.includes(currentKeyword.trim())) {
      setPreferences(prev => ({
        ...prev,
        keywords: [...prev.keywords, currentKeyword.trim()]
      }));
      setCurrentKeyword('');
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setPreferences(prev => ({
      ...prev,
      keywords: prev.keywords.filter(k => k !== keyword)
    }));
  };

  const handleUpdatePlatform = (platformId: string, field: string, value: any) => {
    setPlatforms(prev => prev.map(p => 
      p.id === platformId 
        ? { 
            ...p, 
            [field]: field === 'credentials' 
              ? { ...p.credentials, ...value }
              : value,
            verified: field === 'credentials' ? false : p.verified
          }
        : p
    ));
  };

  const handleTestCredentials = (platform: JobPlatform) => {
    if (!platform.credentials.email || !platform.credentials.password) {
      toast({
        title: "Missing Credentials",
        description: "Please enter both email and password",
        variant: "destructive",
      });
      return;
    }

    testCredentialsMutation.mutate({
      platform: platform.id,
      email: platform.credentials.email,
      password: platform.credentials.password
    });
  };

  const handleRunAutomation = () => {
    if (!backendUser?.isEmailVerified) {
      toast({
        title: "Email verification required",
        description: "Please verify your email to use this feature.",
        variant: "destructive",
      });
      return;
    }

    const enabledPlatforms = platforms.filter(p => p.enabled && p.verified);

    if (enabledPlatforms.length === 0) {
      toast({
        title: "No Platforms Configured",
        description: "Please enable and verify at least one platform",
        variant: "destructive",
      });
      return;
    }

    if (!selectedResumeId) {
      toast({
        title: "No Resume Selected",
        description: "Please select a resume to use for applications",
        variant: "destructive",
      });
      return;
    }

    if (preferences.keywords.length === 0) {
      toast({
        title: "No Keywords",
        description: "Please add at least one job search keyword",
        variant: "destructive",
      });
      return;
    }

    setIsRunning(true);
    setProgress(0);
    setAutomationResults([]);
    
    // Simulate progress
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return prev;
        }
        return prev + Math.random() * 10;
      });
    }, 1000);

    runAutomationMutation.mutate();
  };

  const togglePasswordVisibility = (platformId: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [platformId]: !prev[platformId]
    }));
  };

  const totalJobsFound = automationResults.reduce((sum, result) => sum + result.jobsFound, 0);
  const totalApplicationsSubmitted = automationResults.reduce((sum, result) => sum + result.applicationsSubmitted, 0);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation />
      
      <div className="max-w-7xl mx-auto py-8 px-4">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Bot className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              Real Browser Automation
            </h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Automated job search and application system using real browser automation
          </p>

          <EmailVerificationBanner
            className="mt-4"
            message="Please verify your email to run automated job searches or submit applications."
          />
        </div>

        <Tabs defaultValue="setup" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="setup">Setup</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="run">Run Automation</TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
          </TabsList>

          {/* Platform Setup Tab */}
          <TabsContent value="setup">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 dark:text-gray-100">
                    <Settings className="h-5 w-5" />
                    Platform Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {platforms.map((platform) => (
                    <div key={platform.id} className="border rounded-lg p-4 dark:border-gray-600">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{platform.logo}</span>
                          <div>
                            <h3 className="font-medium dark:text-gray-100">{platform.name}</h3>
                            <div className="flex items-center gap-2">
                              {platform.verified ? (
                                <Badge variant="secondary" className="text-green-600 dark:text-green-400">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Verified
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-gray-500 dark:text-gray-400">
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Not Verified
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <Switch
                          checked={platform.enabled}
                          onCheckedChange={(checked) => 
                            handleUpdatePlatform(platform.id, 'enabled', checked)
                          }
                        />
                      </div>

                      {platform.enabled && (
                        <div className="space-y-3">
                          <div>
                            <Label htmlFor={`${platform.id}-email`} className="dark:text-gray-300">
                              Email/Username
                            </Label>
                            <Input
                              id={`${platform.id}-email`}
                              type="email"
                              value={platform.credentials.email}
                              onChange={(e) => 
                                handleUpdatePlatform(platform.id, 'credentials', { email: e.target.value })
                              }
                              placeholder="Enter your email or username"
                              className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`${platform.id}-password`} className="dark:text-gray-300">
                              Password
                            </Label>
                            <div className="relative">
                              <Input
                                id={`${platform.id}-password`}
                                type={showPasswords[platform.id] ? "text" : "password"}
                                value={platform.credentials.password}
                                onChange={(e) => 
                                  handleUpdatePlatform(platform.id, 'credentials', { password: e.target.value })
                                }
                                placeholder="Enter your password"
                                className="pr-10 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3"
                                onClick={() => togglePasswordVisibility(platform.id)}
                              >
                                {showPasswords[platform.id] ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                          <Button
                            onClick={() => handleTestCredentials(platform)}
                            disabled={testCredentialsMutation.isPending}
                            size="sm"
                            variant="outline"
                            className="w-full dark:border-gray-600 dark:text-gray-300"
                          >
                            <Shield className="h-4 w-4 mr-2" />
                            {testCredentialsMutation.isPending ? 'Testing...' : 'Test Credentials'}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 dark:text-gray-100">
                    <Target className="h-5 w-5" />
                    Resume Selection
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label className="dark:text-gray-300">Select Resume</Label>
                      <Select 
                        value={selectedResumeId?.toString()} 
                        onValueChange={(value) => setSelectedResumeId(parseInt(value))}
                      >
                        <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                          <SelectValue placeholder="Choose a resume for applications" />
                        </SelectTrigger>
                        <SelectContent>
                          {(resumes as any)?.map((resume: any) => (
                            <SelectItem key={resume.id} value={resume.id.toString()}>
                              {resume.fileName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {automationStatus && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          Browser Status: {automationStatus.browserInitialized ? 'Ready' : 'Not Initialized'}
                          {automationStatus.isRunning && ' • Automation Running'}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Preferences Tab */}
          <TabsContent value="preferences">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 dark:text-gray-100">
                  <Settings className="h-5 w-5" />
                  Search Preferences
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Keywords */}
                  <div className="space-y-3">
                    <Label className="dark:text-gray-300">Job Keywords</Label>
                    <div className="flex gap-2">
                      <Input
                        value={currentKeyword}
                        onChange={(e) => setCurrentKeyword(e.target.value)}
                        placeholder="Add a keyword"
                        onKeyPress={(e) => e.key === 'Enter' && handleAddKeyword()}
                        className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      />
                      <Button onClick={handleAddKeyword} size="sm">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {preferences.keywords.map((keyword) => (
                        <Badge key={keyword} variant="secondary" className="gap-1 dark:bg-gray-700 dark:text-gray-300">
                          {keyword}
                          <button onClick={() => handleRemoveKeyword(keyword)}>
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Location */}
                  <div className="space-y-2">
                    <Label className="dark:text-gray-300">Location</Label>
                    <Input
                      value={preferences.location}
                      onChange={(e) => setPreferences(prev => ({ ...prev, location: e.target.value }))}
                      placeholder="City, State or Remote"
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                    />
                  </div>

                  {/* Experience Level */}
                  <div className="space-y-2">
                    <Label className="dark:text-gray-300">Experience Level</Label>
                    <Select 
                      value={preferences.experienceLevel} 
                      onValueChange={(value: any) => setPreferences(prev => ({ ...prev, experienceLevel: value }))}
                    >
                      <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="entry">Entry Level</SelectItem>
                        <SelectItem value="mid">Mid Level</SelectItem>
                        <SelectItem value="senior">Senior Level</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Job Type */}
                  <div className="space-y-2">
                    <Label className="dark:text-gray-300">Job Type</Label>
                    <Select 
                      value={preferences.jobType} 
                      onValueChange={(value: any) => setPreferences(prev => ({ ...prev, jobType: value }))}
                    >
                      <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full-time">Full Time</SelectItem>
                        <SelectItem value="part-time">Part Time</SelectItem>
                        <SelectItem value="contract">Contract</SelectItem>
                        <SelectItem value="internship">Internship</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Remote Preference */}
                  <div className="space-y-2">
                    <Label className="dark:text-gray-300">Remote Work</Label>
                    <Select 
                      value={preferences.remotePreference} 
                      onValueChange={(value: any) => setPreferences(prev => ({ ...prev, remotePreference: value }))}
                    >
                      <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="remote">Remote Only</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                        <SelectItem value="onsite">On-site Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Max Applications */}
                  <div className="space-y-2">
                    <Label className="dark:text-gray-300">Max Applications per Run</Label>
                    <Input
                      type="number"
                      value={preferences.maxApplicationsPerRun}
                      onChange={(e) => setPreferences(prev => ({ ...prev, maxApplicationsPerRun: parseInt(e.target.value) || 1 }))}
                      min="1"
                      max="50"
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                    />
                  </div>
                </div>

                <Separator className="dark:bg-gray-700" />

                {/* Salary Range */}
                <div className="space-y-4">
                  <Label className="dark:text-gray-300">Salary Range (USD)</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm dark:text-gray-400">Minimum</Label>
                      <Input
                        type="number"
                        value={preferences.salaryMin}
                        onChange={(e) => setPreferences(prev => ({ ...prev, salaryMin: parseInt(e.target.value) || 0 }))}
                        placeholder="50000"
                        className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      />
                    </div>
                    <div>
                      <Label className="text-sm dark:text-gray-400">Maximum</Label>
                      <Input
                        type="number"
                        value={preferences.salaryMax}
                        onChange={(e) => setPreferences(prev => ({ ...prev, salaryMax: parseInt(e.target.value) || 0 }))}
                        placeholder="150000"
                        className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Run Automation Tab */}
          <TabsContent value="run">
            <div className="space-y-6">
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 dark:text-gray-100">
                    <Play className="h-5 w-5" />
                    Run Automation
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex items-center gap-3 p-4 border rounded-lg dark:border-gray-600">
                      <Globe className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                      <div>
                        <p className="font-medium dark:text-gray-100">Platforms Enabled</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {platforms.filter(p => p.enabled && p.verified).length} of {platforms.length}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-4 border rounded-lg dark:border-gray-600">
                      <Target className="h-8 w-8 text-green-600 dark:text-green-400" />
                      <div>
                        <p className="font-medium dark:text-gray-100">Keywords</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {preferences.keywords.length} configured
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-4 border rounded-lg dark:border-gray-600">
                      <Clock className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                      <div>
                        <p className="font-medium dark:text-gray-100">Max Applications</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {preferences.maxApplicationsPerRun} per run
                        </p>
                      </div>
                    </div>
                  </div>

                  {isRunning && (
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-sm dark:text-gray-300">
                          <span>Automation Progress</span>
                          <span>{Math.round(progress)}%</span>
                        </div>
                        <Progress value={progress} className="mt-2" />
                      </div>
                      <Alert>
                        <Bot className="h-4 w-4" />
                        <AlertDescription>
                          Automation is running... Please don't close this page.
                        </AlertDescription>
                      </Alert>
                    </div>
                  )}

                  <div className="flex justify-center">
                    <Button
                      onClick={handleRunAutomation}
                      disabled={isRunning || runAutomationMutation.isPending || !backendUser?.isEmailVerified}
                      size="lg"
                      className="px-8"
                    >
                      {isRunning ? (
                        <>
                          <Pause className="h-5 w-5 mr-2" />
                          Running Automation...
                        </>
                      ) : (
                        <>
                          <Play className="h-5 w-5 mr-2" />
                          Start Job Search
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Scheduling Section */}
              <SchedulingInterface 
                platforms={platforms.filter(p => p.enabled && p.verified)}
                preferences={preferences}
                selectedResumeId={selectedResumeId}
              />
            </div>
          </TabsContent>

          {/* Results Tab */}
          <TabsContent value="results">
            <div className="space-y-6">
              {automationResults.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="dark:bg-gray-800 dark:border-gray-700">
                    <CardContent className="flex items-center gap-3 p-6">
                      <BarChart3 className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                      <div>
                        <p className="text-2xl font-bold dark:text-gray-100">{totalJobsFound}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Jobs Found</p>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="dark:bg-gray-800 dark:border-gray-700">
                    <CardContent className="flex items-center gap-3 p-6">
                      <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                      <div>
                        <p className="text-2xl font-bold dark:text-gray-100">{totalApplicationsSubmitted}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Applications Submitted</p>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="dark:bg-gray-800 dark:border-gray-700">
                    <CardContent className="flex items-center gap-3 p-6">
                      <Target className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                      <div>
                        <p className="text-2xl font-bold dark:text-gray-100">
                          {totalJobsFound > 0 ? Math.round((totalApplicationsSubmitted / totalJobsFound) * 100) : 0}%
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Success Rate</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {automationResults.map((result, index) => (
                  <Card key={index} className="dark:bg-gray-800 dark:border-gray-700">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 dark:text-gray-100">
                        <span className="text-2xl">
                          {result.platform === 'indeed' ? '🔍' : 
                           result.platform === 'linkedin' ? '💼' : '🇮🇳'}
                        </span>
                        {result.platform}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Jobs Found:</span>
                          <span className="ml-2 font-medium dark:text-gray-100">{result.jobsFound}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Applied:</span>
                          <span className="ml-2 font-medium dark:text-gray-100">{result.applicationsSubmitted}</span>
                        </div>
                      </div>

                      {result.errors.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-red-600 dark:text-red-400">Errors:</p>
                          {result.errors.map((error, errorIndex) => (
                            <p key={errorIndex} className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">
                              {error}
                            </p>
                          ))}
                        </div>
                      )}

                      {result.jobsApplied.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium dark:text-gray-100">Applied Jobs:</p>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {result.jobsApplied.map((job, jobIndex) => (
                              <div key={jobIndex} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded text-xs">
                                <div>
                                  <p className="font-medium dark:text-gray-100">{job.title}</p>
                                  <p className="text-gray-500 dark:text-gray-400">{job.company}</p>
                                </div>
                                <Badge variant={job.status === 'applied' ? 'default' : 'destructive'}>
                                  {job.status}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {automationResults.length === 0 && (
                <Card className="dark:bg-gray-800 dark:border-gray-700">
                  <CardContent className="text-center py-12">
                    <Bot className="h-16 w-16 mx-auto text-gray-400 dark:text-gray-600 mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">
                      No automation results yet. Run your first job search to see results here.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}