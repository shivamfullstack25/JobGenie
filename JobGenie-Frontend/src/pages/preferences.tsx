import {useEffect, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Switch} from "@/components/ui/switch";
import {Badge} from "@/components/ui/badge";
import {Separator} from "@/components/ui/separator";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {useToast} from "@/hooks/use-toast";
import {apiRequest} from "@/lib/queryClient";
import {resumeAPI} from "@/lib/api";
import Navigation from "@/components/navigation";
import LocationSearch from "@/components/location-search";
import {extractSkillsFromResume, formatSkillsForJobSearch} from "@/services/skillExtractor";
import {useAuth} from "../context/AuthContext";

export default function Preferences() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { backendUser } = useAuth();
  const userId = backendUser?.id;

  const [preferences, setPreferences] = useState({
    emailNotifications: true,
    jobAlerts: true,
    preferredJobTypes: [] as string[],
    salaryRange: { min: 500000, max: 1500000, currency: 'INR' },
    preferredLocations: [] as string[],
    remotePreference: 'open' as 'required' | 'preferred' | 'open' | 'no',
    skills: '' as string,
  });

  const [newJobType, setNewJobType] = useState("");
  const [isExtractingSkills, setIsExtractingSkills] = useState(false);

  // GET/PUT /api/preferences both require a userId query param on the backend
  // (PreferencesController.getPreferences/updatePreferences) — this previously fetched
  // "/api/preferences" with no userId at all, which the backend rejected. Query is disabled
  // until we know who's logged in so it doesn't fire (and error) during the auth check.
  const { data: userPreferences, isLoading } = useQuery<Record<string, any>>({
    queryKey: [`/api/preferences?userId=${userId}`],
    enabled: !!userId,
  });

  const { data: resumes } = useQuery<any[]>({
    queryKey: ["user-resumes", userId],
    queryFn: () => resumeAPI.getUserResumes(Number(userId)),
    enabled: !!userId,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!userId) {
        throw new Error("You must be logged in to save preferences");
      }
      return await apiRequest(`/api/preferences?userId=${userId}`, "PUT", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/preferences?userId=${userId}`] });
      toast({
        title: "Preferences Updated",
        description: "Your job search preferences have been saved successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update preferences. Please try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (userPreferences) {
      setPreferences({
        emailNotifications: userPreferences.emailNotifications ?? true,
        jobAlerts: userPreferences.jobAlerts ?? true,
        preferredJobTypes: userPreferences.preferredJobTypes ?? [],
        salaryRange: userPreferences.salaryRange ?? { min: 500000, max: 1500000, currency: 'INR' },
        preferredLocations: userPreferences.preferredLocations ?? [],
        remotePreference: userPreferences.remotePreference ?? 'open',
        skills: userPreferences.skills ?? '',
      });
    }
  }, [userPreferences]);

  // Auto-extract skills from selected resume
  const handleResumeSkillExtraction = async (resumeId: string) => {
    if (!resumes || isExtractingSkills) return;
    
    setIsExtractingSkills(true);
    try {
      const selectedResume = resumes.find((r: any) => r.id === resumeId);
      if (selectedResume && selectedResume.content) {
        const analysis = await extractSkillsFromResume(selectedResume.content);
        const skillsString = formatSkillsForJobSearch(analysis);
        
        setPreferences(prev => ({
          ...prev,
          skills: skillsString
        }));

        toast({
          title: "Skills Extracted Successfully",
          description: `Found ${skillsString.split(',').length} relevant skills from your resume`,
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
    setPreferences(prev => ({
      ...prev,
      salaryRange: {
        ...prev.salaryRange,
        currency: currency
      }
    }));

    toast({
      title: "Currency Updated",
      description: `Salary currency changed to ${currency} (${symbol})`,
    });
  };

  const handleSave = () => {
    updateMutation.mutate(preferences);
  };

  const addJobType = () => {
    if (newJobType.trim() && !preferences.preferredJobTypes.includes(newJobType.trim())) {
      setPreferences(prev => ({
        ...prev,
        preferredJobTypes: [...prev.preferredJobTypes, newJobType.trim()]
      }));
      setNewJobType("");
    }
  };

  const removeJobType = (jobType: string) => {
    setPreferences(prev => ({
      ...prev,
      preferredJobTypes: prev.preferredJobTypes.filter(type => type !== jobType)
    }));
  };

  const remoteOptions = [
    { value: 'required', label: 'Remote Only', description: 'Only show remote positions' },
    { value: 'preferred', label: 'Remote Preferred', description: 'Prioritize remote positions' },
    { value: 'open', label: 'Open to Both', description: 'Remote and on-site positions' },
    { value: 'no', label: 'On-site Only', description: 'Only show on-site positions' },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Job Search Preferences
          </h1>
          <p className="text-gray-600 mt-2">
            Customize your job search experience and automation settings
          </p>
        </div>

        <div className="space-y-6">
          {/* Notification Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Notification Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-medium">Email Notifications</Label>
                  <p className="text-sm text-gray-600">Receive email updates about job matches and applications</p>
                </div>
                <Switch
                  checked={preferences.emailNotifications}
                  onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, emailNotifications: checked }))}
                />
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-medium">Job Alerts</Label>
                  <p className="text-sm text-gray-600">Get notified when new matching jobs are found</p>
                </div>
                <Switch
                  checked={preferences.jobAlerts}
                  onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, jobAlerts: checked }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* Skills & Job Criteria */}
          <Card>
            <CardHeader>
              <CardTitle>Skills & Job Search Criteria</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Skills (comma-separated)</Label>
                <div className="space-y-2">
                  <Input
                    value={preferences.skills}
                    onChange={(e) => setPreferences(prev => ({ ...prev, skills: e.target.value }))}
                    placeholder="e.g. React, Node.js, TypeScript, AWS"
                    className="mt-2"
                  />
                  {resumes && resumes.length > 0 && (
                    <div className="flex items-center space-x-2">
                      <Select onValueChange={handleResumeSkillExtraction}>
                        <SelectTrigger className="w-64">
                          <SelectValue placeholder="Extract from resume..." />
                        </SelectTrigger>
                        <SelectContent>
                          {resumes.map((resume: any) => (
                            <SelectItem key={resume.id} value={resume.id}>
                              {resume.filename}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isExtractingSkills && (
                        <span className="text-sm text-muted-foreground">Extracting skills...</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              <div>
                <Label>Preferred Job Types</Label>
                <div className="flex space-x-2 mt-2">
                  <Input
                    value={newJobType}
                    onChange={(e) => setNewJobType(e.target.value)}
                    placeholder="e.g. Full-time, Part-time, Contract"
                    onKeyPress={(e) => e.key === 'Enter' && addJobType()}
                  />
                  <Button onClick={addJobType} variant="outline">
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {preferences.preferredJobTypes.map((jobType, index) => (
                    <Badge key={index} variant="secondary" className="cursor-pointer">
                      {jobType}
                      <button
                        onClick={() => removeJobType(jobType)}
                        className="ml-2 text-red-500 hover:text-red-700"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Salary Preferences */}
          <Card>
            <CardHeader>
              <CardTitle>Salary Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Minimum Salary</Label>
                  <Input
                    type="number"
                    value={preferences.salaryRange.min || ""}
                    onChange={(e) => setPreferences(prev => ({
                      ...prev,
                      salaryRange: { ...prev.salaryRange, min: Number(e.target.value) }
                    }))}
                    placeholder="500000"
                  />
                </div>
                <div>
                  <Label>Maximum Salary</Label>
                  <Input
                    type="number"
                    value={preferences.salaryRange.max || ""}
                    onChange={(e) => setPreferences(prev => ({
                      ...prev,
                      salaryRange: { ...prev.salaryRange, max: Number(e.target.value) }
                    }))}
                    placeholder="1500000"
                  />
                </div>
                <div>
                  <Label>Currency</Label>
                  <Select 
                    value={preferences.salaryRange.currency}
                    onValueChange={(value) => setPreferences(prev => ({
                      ...prev,
                      salaryRange: { ...prev.salaryRange, currency: value }
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INR">INR (₹)</SelectItem>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="EUR">EUR (€)</SelectItem>
                      <SelectItem value="GBP">GBP (£)</SelectItem>
                      <SelectItem value="CAD">CAD (C$)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Location Preferences */}
          <Card>
            <CardHeader>
              <CardTitle>Location Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Preferred Locations</Label>
                <LocationSearch
                  selectedLocations={preferences.preferredLocations}
                  onLocationAdd={(location) => setPreferences(prev => ({
                    ...prev,
                    preferredLocations: [...prev.preferredLocations, location]
                  }))}
                  onLocationRemove={(location) => setPreferences(prev => ({
                    ...prev,
                    preferredLocations: prev.preferredLocations.filter(loc => loc !== location)
                  }))}
                  onCurrencyChange={handleCurrencyChange}
                  placeholder="Search cities worldwide (e.g. New York, London, Bengaluru)"
                  maxLocations={5}
                />
                <p className="text-sm text-muted-foreground mt-2">
                  Currency will automatically update based on your selected location
                </p>
              </div>

              <Separator />

              <div>
                <Label className="text-base font-medium">Remote Work Preference</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                  {remoteOptions.map((option) => (
                    <div 
                      key={option.value} 
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        preferences.remotePreference === option.value 
                          ? 'border-primary bg-primary/5' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setPreferences(prev => ({ ...prev, remotePreference: option.value as any }))}
                    >
                      <div className="flex items-center space-x-3">
                        <input
                          type="radio"
                          name="remotePreference"
                          value={option.value}
                          checked={preferences.remotePreference === option.value}
                          readOnly
                          className="text-primary"
                        />
                        <div>
                          <div className="font-medium">{option.label}</div>
                          <div className="text-sm text-gray-600">{option.description}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending || !userId}
              className="px-8"
            >
              {updateMutation.isPending ? "Saving..." : "Save Preferences"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}