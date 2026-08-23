import {useState} from 'react';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Badge} from '@/components/ui/badge';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useAuth} from '@/context/AuthContext';
import {useToast} from '@/hooks/use-toast';
import {jobAPI, resumeAPI} from '@/lib/api';
import EmailVerificationBanner from '@/components/EmailVerificationBanner';
import {
    Calendar,
    DollarSign,
    ExternalLink,
    MapPin,
    RefreshCw,
    Search,
    Star,
    TrendingUp,
    Users,
    Zap
} from 'lucide-react';

interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  salary?: string;
  description: string;
  matchingScore: number;
  platform: 'indeed' | 'linkedin' | 'naukri' | 'glassdoor' | 'monster';
  postedDate: string;
  jobType: 'full-time' | 'part-time' | 'contract' | 'internship';
  experienceLevel: 'entry' | 'mid' | 'senior' | 'executive';
  skills: string[];
  url: string;
  applyUrl: string;
  isRemote: boolean;
  companyRating?: number;
  applicantCount?: number;
  views?: number;
}

interface SearchFilters {
  keywords: string;
  location: string;
  platform: string;
  jobType: string;
  experienceLevel: string;
  salaryMin: string;
  salaryMax: string;
  remote: boolean;
  postedWithin: string;
}

interface AggregatorStats {
  totalJobs: number;
  platformBreakdown: Record<string, number>;
  averageMatchScore: number;
  topSkills: string[];
  salaryRanges: Record<string, number>;
  remotePercentage: number;
}

const platformColors = {
  indeed: 'bg-blue-500',
  linkedin: 'bg-blue-700',
  naukri: 'bg-purple-500',
  glassdoor: 'bg-green-500',
  monster: 'bg-orange-500'
};

const platformIcons = {
  indeed: '🔍',
  linkedin: '💼',
  naukri: '🇮🇳',
  glassdoor: '🏢',
  monster: '👾'
};

export default function JobAggregator() {
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({
    keywords: '',
    location: '',
    platform: 'all',
    jobType: 'all',
    experienceLevel: 'all',
    salaryMin: '',
    salaryMax: '',
    remote: false,
    postedWithin: '30'
  });

  const [sortBy, setSortBy] = useState<'relevance' | 'date' | 'salary' | 'match_score'>('relevance');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());

  const { backendUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: resumes = [] } = useQuery({
    queryKey: ['user-resumes', backendUser?.id],
    queryFn: async () => {
      if (!backendUser?.id) return [];
      return resumeAPI.getUserResumes(backendUser.id);
    },
    enabled: !!backendUser?.id,
  });
  const effectiveResumeId =
    Array.isArray(resumes) && resumes[0]?.id ? String(resumes[0].id) : '';

  const { data: jobListings = [], isLoading: jobsLoading } = useQuery<JobListing[]>({
    queryKey: ['/api/job-aggregator/search', searchFilters, sortBy],
    // /api/job-aggregator/search is POST-only — the default GET queryFn would 405.
    queryFn: async () => {
      const response = await fetch('/api/job-aggregator/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...searchFilters, sortBy }),
      });
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      return data.jobs ?? [];
    },
    enabled: searchFilters.keywords.length > 0
  });

  const { data: stats } = useQuery<AggregatorStats>({
    queryKey: ['/api/job-aggregator/stats', searchFilters],
    enabled: searchFilters.keywords.length > 0
  });

  const searchMutation = useMutation({
    mutationFn: async (filters: SearchFilters) => {
      const response = await fetch('/api/job-aggregator/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...filters, sortBy })
      });
      if (!response.ok) throw new Error('Search failed');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/job-aggregator/search'] });
      queryClient.invalidateQueries({ queryKey: ['/api/job-aggregator/stats'] });
    }
  });

  const autoApplyMutation = useMutation({
    // There is no /api/job-aggregator/auto-apply endpoint on any backend service — this used to
    // POST straight into a 404. Route through job-service's real /api/jobs/apply instead (same
    // endpoint job-matches.tsx's "Auto Apply" uses), which persists each application and fetches
    // the actual resume content for the AI auto-apply call.
    mutationFn: async (jobIds: string[]) => {
      if (!backendUser?.id) {
        throw new Error('Please log in to apply to jobs');
      }
      if (!effectiveResumeId) {
        throw new Error('Upload a resume before auto-applying');
      }
      const outcomes = await Promise.allSettled(
        jobIds.map((jobId) =>
          jobAPI.applyToJob(jobId, backendUser.id.toString(), effectiveResumeId),
        ),
      );
      const succeeded = outcomes.filter((o) => o.status === 'fulfilled').length;
      const failed = outcomes.length - succeeded;
      if (succeeded === 0 && failed > 0) {
        const firstError = outcomes.find(
          (o): o is PromiseRejectedResult => o.status === 'rejected',
        );
        throw new Error(firstError?.reason?.message || 'Auto-apply failed');
      }
      return { succeeded, failed };
    },
    onSuccess: ({ succeeded, failed }: { succeeded: number; failed: number }) => {
      setSelectedJobs(new Set());
      toast({
        title: 'Auto-Apply Complete',
        description:
          failed > 0
            ? `${succeeded} application(s) submitted, ${failed} failed`
            : `${succeeded} application(s) submitted`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Auto-apply failed',
        description: error?.message || 'Could not submit applications',
        variant: 'destructive',
      });
    },
  });

  const handleSearch = () => {
    searchMutation.mutate(searchFilters);
  };

  const handleAutoApply = (jobId?: string) => {
    if (!backendUser?.isEmailVerified) {
      toast({
        title: "Email verification required",
        description: "Please verify your email to use this feature.",
        variant: "destructive",
      });
      return;
    }
    const jobsToApply = jobId ? [jobId] : Array.from(selectedJobs);
    autoApplyMutation.mutate(jobsToApply);
  };

  const getMatchScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600 bg-green-50';
    if (score >= 75) return 'text-blue-600 bg-blue-50';
    if (score >= 60) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const formatSalary = (salary?: string) => {
    if (!salary) return 'Not specified';
    return salary;
  };

  const formatPostedDate = (date: string) => {
    const posted = new Date(date);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - posted.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
    return `${Math.ceil(diffDays / 30)} months ago`;
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
          <Search className="h-10 w-10 text-blue-600" />
          Job Search Aggregator
        </h1>
        <p className="text-gray-600 text-lg">
          Find the best jobs across all major platforms with AI-powered matching and analytics
        </p>
      </div>

      <EmailVerificationBanner message="Please verify your email to auto-apply to jobs. Searching and browsing stay available either way." />

      {/* Search Filters */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="lg:col-span-2">
              <Input
                placeholder="Job title, skills, or company..."
                value={searchFilters.keywords}
                onChange={(e) => setSearchFilters(prev => ({ ...prev, keywords: e.target.value }))}
                className="h-12"
              />
            </div>
            <Input
              placeholder="Location"
              value={searchFilters.location}
              onChange={(e) => setSearchFilters(prev => ({ ...prev, location: e.target.value }))}
              className="h-12"
            />
            <Button 
              onClick={handleSearch} 
              className="h-12 bg-blue-600 hover:bg-blue-700"
              disabled={searchMutation.isPending}
            >
              {searchMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Search Jobs
            </Button>
          </div>

          {/* Advanced Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Select
              value={searchFilters.platform}
              onValueChange={(value) => setSearchFilters(prev => ({ ...prev, platform: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="All Platforms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                <SelectItem value="indeed">Indeed</SelectItem>
                <SelectItem value="linkedin">LinkedIn</SelectItem>
                <SelectItem value="naukri">Naukri</SelectItem>
                <SelectItem value="glassdoor">Glassdoor</SelectItem>
                <SelectItem value="monster">Monster</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={searchFilters.jobType}
              onValueChange={(value) => setSearchFilters(prev => ({ ...prev, jobType: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Job Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="full-time">Full Time</SelectItem>
                <SelectItem value="part-time">Part Time</SelectItem>
                <SelectItem value="contract">Contract</SelectItem>
                <SelectItem value="internship">Internship</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={searchFilters.experienceLevel}
              onValueChange={(value) => setSearchFilters(prev => ({ ...prev, experienceLevel: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Experience Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="entry">Entry Level</SelectItem>
                <SelectItem value="mid">Mid Level</SelectItem>
                <SelectItem value="senior">Senior Level</SelectItem>
                <SelectItem value="executive">Executive</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={sortBy}
              onValueChange={(value: any) => setSortBy(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sort By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relevance">Relevance</SelectItem>
                <SelectItem value="match_score">Match Score</SelectItem>
                <SelectItem value="date">Date Posted</SelectItem>
                <SelectItem value="salary">Salary</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Analytics Dashboard */}
      {stats && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Search Analytics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">{stats.totalJobs}</div>
                <div className="text-sm text-gray-600">Total Jobs Found</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{stats.averageMatchScore}%</div>
                <div className="text-sm text-gray-600">Avg. Match Score</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600">{stats.remotePercentage}%</div>
                <div className="text-sm text-gray-600">Remote Positions</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-orange-600">{Object.keys(stats.platformBreakdown).length}</div>
                <div className="text-sm text-gray-600">Platforms Searched</div>
              </div>
            </div>

            {/* Platform Breakdown */}
            <div className="mt-6">
              <h4 className="font-semibold mb-3">Platform Distribution</h4>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {Object.entries(stats.platformBreakdown).map(([platform, count]) => (
                  <div key={platform} className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-lg font-bold">{count}</div>
                    <div className="text-xs text-gray-600 capitalize flex items-center justify-center gap-1">
                      <span>{platformIcons[platform as keyof typeof platformIcons]}</span>
                      {platform}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Actions */}
      {jobListings.length > 0 && (
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <span className="text-gray-600">
              {jobListings.length} jobs found
            </span>
            {selectedJobs.size > 0 && (
              <Button
                onClick={() => handleAutoApply()}
                className="bg-green-600 hover:bg-green-700"
                disabled={autoApplyMutation.isPending || !backendUser?.isEmailVerified}
              >
                <Zap className="h-4 w-4 mr-2" />
                Auto-Apply to {selectedJobs.size} Jobs
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              List
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              Grid
            </Button>
          </div>
        </div>
      )}

      {/* Job Listings */}
      {jobsLoading && (
        <div className="flex justify-center items-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Searching across all platforms...</span>
        </div>
      )}

      {jobListings.length > 0 && (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : 'space-y-4'}>
          {jobListings.map((job: JobListing) => (
            <Card key={job.id} className="hover:shadow-lg transition-shadow duration-200">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold text-gray-900">{job.title}</h3>
                      <Badge className={`${getMatchScoreColor(job.matchingScore)} font-semibold`}>
                        {job.matchingScore}% Match
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-gray-600 mb-3">
                      <span className="font-medium">{job.company}</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {job.location}
                        {job.isRemote && <Badge variant="secondary" className="ml-1">Remote</Badge>}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {formatPostedDate(job.postedDate)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedJobs.has(job.id)}
                      onChange={(e) => {
                        const newSelected = new Set(selectedJobs);
                        if (e.target.checked) {
                          newSelected.add(job.id);
                        } else {
                          newSelected.delete(job.id);
                        }
                        setSelectedJobs(newSelected);
                      }}
                      className="h-4 w-4"
                    />
                    <Badge className={`${platformColors[job.platform]} text-white`}>
                      {platformIcons[job.platform]} {job.platform}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  {job.salary && (
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-green-600" />
                      <span className="font-medium">{formatSalary(job.salary)}</span>
                    </div>
                  )}
                  {job.companyRating && (
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-yellow-500" />
                      <span>{job.companyRating}/5</span>
                    </div>
                  )}
                  {job.applicantCount && (
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-600" />
                      <span>{job.applicantCount} applicants</span>
                    </div>
                  )}
                </div>

                <p className="text-gray-700 mb-4 line-clamp-3">{job.description}</p>

                {job.skills.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {job.skills.slice(0, 5).map((skill, index) => (
                      <Badge key={index} variant="outline">{skill}</Badge>
                    ))}
                    {job.skills.length > 5 && (
                      <Badge variant="outline">+{job.skills.length - 5} more</Badge>
                    )}
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    onClick={() => window.open(job.url, '_blank')}
                    variant="outline"
                    className="flex-1"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View on {job.platform}
                  </Button>
                  <Button
                    onClick={() => handleAutoApply(job.id)}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    disabled={autoApplyMutation.isPending || !backendUser?.isEmailVerified}
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    Auto-Apply
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!jobsLoading && jobListings.length === 0 && searchFilters.keywords && (
        <Card className="text-center py-12">
          <CardContent>
            <Search className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-600 mb-2">No jobs found</h3>
            <p className="text-gray-500">
              Try adjusting your search criteria or keywords
            </p>
          </CardContent>
        </Card>
      )}

      {!searchFilters.keywords && (
        <Card className="text-center py-12">
          <CardContent>
            <Search className="h-16 w-16 text-blue-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-600 mb-2">Start Your Job Search</h3>
            <p className="text-gray-500">
              Enter keywords to search across all major job platforms
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}