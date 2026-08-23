import {useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {Calendar, Clock, Plus, Settings, Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Badge} from '@/components/ui/badge';
import {Switch} from '@/components/ui/switch';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger} from '@/components/ui/dialog';
import {Alert, AlertDescription} from '@/components/ui/alert';
import {useToast} from '@/hooks/use-toast';
import {apiRequest} from '@/lib/queryClient';

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

interface SchedulingInterfaceProps {
  platforms: JobPlatform[];
  preferences: AutomationPreferences;
  selectedResumeId: number | null;
}

interface JobSchedule {
  id: number;
  frequency: string;
  platforms: string[];
  jobPreferences: any;
  platformCredentials: any;
  isActive: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  resumeId: number;
}

export default function SchedulingInterface({ platforms, preferences, selectedResumeId }: SchedulingInterfaceProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    frequency: 'daily',
    selectedPlatforms: [] as string[],
    customCronExpression: ''
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch existing schedules
  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['/api/schedules']
  });

  // Create schedule mutation
  const createScheduleMutation = useMutation({
    mutationFn: async (scheduleData: any) => {
      return await apiRequest('/api/schedules', {
        method: 'POST',
        body: JSON.stringify(scheduleData)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/schedules'] });
      setIsCreateDialogOpen(false);
      setNewSchedule({
        frequency: 'daily',
        selectedPlatforms: [],
        customCronExpression: ''
      });
      toast({
        title: 'Schedule Created',
        description: 'Your automated job search has been scheduled successfully.'
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to create schedule. Please try again.',
        variant: 'destructive'
      });
    }
  });

  // Toggle schedule mutation
  const toggleScheduleMutation = useMutation({
    mutationFn: async (scheduleId: number) => {
      return await apiRequest(`/api/schedules/${scheduleId}/toggle`, {
        method: 'POST'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/schedules'] });
      toast({
        title: 'Schedule Updated',
        description: 'Schedule status has been updated.'
      });
    }
  });

  // Delete schedule mutation
  const deleteScheduleMutation = useMutation({
    mutationFn: async (scheduleId: number) => {
      return await apiRequest(`/api/schedules/${scheduleId}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/schedules'] });
      toast({
        title: 'Schedule Deleted',
        description: 'Schedule has been removed successfully.'
      });
    }
  });

  const handleCreateSchedule = () => {
    if (!selectedResumeId) {
      toast({
        title: 'Error',
        description: 'Please select a resume first.',
        variant: 'destructive'
      });
      return;
    }

    if (newSchedule.selectedPlatforms.length === 0) {
      toast({
        title: 'Error',
        description: 'Please select at least one platform.',
        variant: 'destructive'
      });
      return;
    }

    // Prepare platform credentials
    const platformCredentials: any = {};
    newSchedule.selectedPlatforms.forEach(platformId => {
      const platform = platforms.find(p => p.id === platformId);
      if (platform) {
        platformCredentials[platformId] = platform.credentials;
      }
    });

    const scheduleData = {
      frequency: newSchedule.frequency === 'custom' ? newSchedule.customCronExpression : newSchedule.frequency,
      platforms: newSchedule.selectedPlatforms,
      jobPreferences: preferences,
      platformCredentials,
      resumeId: selectedResumeId,
      isActive: true
    };

    createScheduleMutation.mutate(scheduleData);
  };

  const formatFrequency = (frequency: string) => {
    switch (frequency.toLowerCase()) {
      case 'hourly': return 'Every Hour';
      case 'daily': return 'Daily at 9 AM';
      case 'weekly': return 'Weekly on Monday';
      case 'monthly': return 'Monthly on 1st';
      default: return frequency;
    }
  };

  const formatNextRun = (nextRunAt: string | null) => {
    if (!nextRunAt) return 'Not scheduled';
    return new Date(nextRunAt).toLocaleString();
  };

  return (
    <Card className="dark:bg-gray-800 dark:border-gray-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 dark:text-gray-100">
            <Calendar className="h-5 w-5" />
            Scheduled Automation
          </CardTitle>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Create Schedule
              </Button>
            </DialogTrigger>
            <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
              <DialogHeader>
                <DialogTitle className="dark:text-gray-100">Create New Schedule</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label className="dark:text-gray-200">Frequency</Label>
                  <Select 
                    value={newSchedule.frequency} 
                    onValueChange={(value) => setNewSchedule({...newSchedule, frequency: value})}
                  >
                    <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                      <SelectItem value="hourly">Every Hour</SelectItem>
                      <SelectItem value="daily">Daily (9 AM UTC)</SelectItem>
                      <SelectItem value="weekly">Weekly (Monday 9 AM UTC)</SelectItem>
                      <SelectItem value="monthly">Monthly (1st 9 AM UTC)</SelectItem>
                      <SelectItem value="custom">Custom Cron Expression</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {newSchedule.frequency === 'custom' && (
                  <div>
                    <Label className="dark:text-gray-200">Cron Expression</Label>
                    <Input
                      value={newSchedule.customCronExpression}
                      onChange={(e) => setNewSchedule({...newSchedule, customCronExpression: e.target.value})}
                      placeholder="0 9 * * *"
                      className="dark:bg-gray-700 dark:border-gray-600"
                    />
                  </div>
                )}

                <div>
                  <Label className="dark:text-gray-200">Select Platforms</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {platforms.map(platform => (
                      <div key={platform.id} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={platform.id}
                          checked={newSchedule.selectedPlatforms.includes(platform.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewSchedule({
                                ...newSchedule,
                                selectedPlatforms: [...newSchedule.selectedPlatforms, platform.id]
                              });
                            } else {
                              setNewSchedule({
                                ...newSchedule,
                                selectedPlatforms: newSchedule.selectedPlatforms.filter(id => id !== platform.id)
                              });
                            }
                          }}
                          className="rounded"
                        />
                        <label htmlFor={platform.id} className="text-sm dark:text-gray-200">
                          {platform.name}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <Alert>
                  <Settings className="h-4 w-4" />
                  <AlertDescription>
                    This will use your current search preferences and platform credentials.
                  </AlertDescription>
                </Alert>

                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreateSchedule}
                    disabled={createScheduleMutation.isPending}
                  >
                    Create Schedule
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 dark:text-gray-400">Loading schedules...</div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-8">
            <Calendar className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">No scheduled automations yet</p>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Create a schedule to run automated job searches at regular intervals
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {schedules.map((schedule: JobSchedule) => (
              <div key={schedule.id} className="border rounded-lg p-4 dark:border-gray-600">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <div>
                      <p className="font-medium dark:text-gray-100">
                        {formatFrequency(schedule.frequency)}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Next run: {formatNextRun(schedule.nextRunAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={schedule.isActive ? "default" : "secondary"}>
                      {schedule.isActive ? 'Active' : 'Paused'}
                    </Badge>
                    <Switch
                      checked={schedule.isActive}
                      onCheckedChange={() => toggleScheduleMutation.mutate(schedule.id)}
                      disabled={toggleScheduleMutation.isPending}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  {schedule.platforms.map(platformId => {
                    const platform = platforms.find(p => p.id === platformId);
                    return platform ? (
                      <Badge key={platformId} variant="outline" className="dark:border-gray-600">
                        {platform.name}
                      </Badge>
                    ) : null;
                  })}
                </div>

                {schedule.lastRunAt && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Last run: {new Date(schedule.lastRunAt).toLocaleString()}
                  </p>
                )}

                <div className="flex justify-end">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteScheduleMutation.mutate(schedule.id)}
                    disabled={deleteScheduleMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}