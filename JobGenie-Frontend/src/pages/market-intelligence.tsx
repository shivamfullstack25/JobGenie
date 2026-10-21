import {useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {apiRequest} from "@/lib/queryClient";
import {useAuth} from "@/context/AuthContext";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Badge} from "@/components/ui/badge";
import {Progress} from "@/components/ui/progress";
import Navigation from "@/components/navigation";
import {
    ArrowDownRight,
    ArrowUpRight,
    Award,
    BarChart3,
    Brain,
    Building,
    DollarSign,
    Minus,
    Target,
    TrendingUp,
    Users,
    Zap
} from "lucide-react";

interface MarketInsight {
  category: string;
  title: string;
  value: string | number;
  change?: string;
  trend: 'up' | 'down' | 'stable';
  confidence: number;
  source: string;
  lastUpdated: Date;
}

export default function MarketIntelligence() {
  const { loading } = useAuth();
  const [analysisFilters, setAnalysisFilters] = useState({
    jobTitle: '',
    industry: '',
    location: '',
    experienceLevel: '',
    analysisType: 'overview'
  });


  // Market insights mutation
  const insightsMutation = useMutation({
    mutationFn: async (filters: any) => {
      // apiRequest resolves to the raw fetch Response, not parsed JSON (see
      // queryClient.ts) — every mutation below must call .json() itself or
      // `.data` ends up being a Response object with none of the fields the
      // render* helpers below expect, so the tab silently shows nothing.
      const res = await apiRequest('/api/market-intelligence/insights', {
        method: 'POST',
        body: JSON.stringify(filters)
      });
      return res.json();
    }
  });

  // Salary analysis mutation
  const salaryMutation = useMutation({
    mutationFn: async (filters: any) => {
      const res = await apiRequest('/api/market-intelligence/salary', {
        method: 'POST',
        body: JSON.stringify(filters)
      });
      return res.json();
    }
  });

  // Skills gap analysis mutation
  const skillsMutation = useMutation({
    mutationFn: async (filters: any) => {
      const res = await apiRequest('/api/market-intelligence/skills', {
        method: 'POST',
        body: JSON.stringify(filters)
      });
      return res.json();
    }
  });

  // Company insights mutation
  const companiesMutation = useMutation({
    mutationFn: async (companies: string[]) => {
      const res = await apiRequest('/api/market-intelligence/companies', {
        method: 'POST',
        body: JSON.stringify({ companies })
      });
      return res.json();
    }
  });

  // Trends analysis mutation
  const trendsMutation = useMutation({
    mutationFn: async (filters: any) => {
      const res = await apiRequest('/api/market-intelligence/trends', {
        method: 'POST',
        body: JSON.stringify(filters)
      });
      return res.json();
    }
  });

  const handleAnalyzeMarket = (analysisType: string) => {
    const filters = { ...analysisFilters, analysisType };
    
    switch (analysisType) {
      case 'salary':
        salaryMutation.mutate(filters);
        break;
      case 'skills':
        skillsMutation.mutate(filters);
        break;
      case 'trends':
        trendsMutation.mutate(filters);
        break;
      default:
        insightsMutation.mutate(filters);
    }
  };

  const handleAnalyzeCompanies = () => {
    const companies = ['Google', 'Microsoft', 'Amazon', 'Apple', 'Meta'];
    companiesMutation.mutate(companies);
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <ArrowUpRight className="h-4 w-4 text-green-600" />;
      case 'down': return <ArrowDownRight className="h-4 w-4 text-red-600" />;
      default: return <Minus className="h-4 w-4 text-gray-600" />;
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'up': return 'text-green-600 dark:text-green-400';
      case 'down': return 'text-red-600 dark:text-red-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  const renderInsightsData = (data: any) => {
    if (!data?.insights) return null;
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.insights.map((insight: MarketInsight, index: number) => (
          <Card key={index} className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {getTrendIcon(insight.trend)}
                  <span className="text-sm font-medium dark:text-gray-100">{insight.title}</span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {Math.round(insight.confidence * 100)}%
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-lg font-bold ${getTrendColor(insight.trend)}`}>
                  {insight.value}
                </span>
                {insight.change && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    ({insight.change})
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {insight.source}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderSalaryData = (data: any) => {
    if (!data) return null;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-5 w-5 text-green-600" />
                <span className="font-medium dark:text-gray-100">Salary Range</span>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-bold dark:text-gray-100">
                  ${data.salaryRange?.min?.toLocaleString()} - ${data.salaryRange?.max?.toLocaleString()}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Median: ${data.salaryRange?.median?.toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-5 w-5 text-blue-600" />
                <span className="font-medium dark:text-gray-100">Market Demand</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={data.marketDemand === 'high' ? 'default' : data.marketDemand === 'medium' ? 'secondary' : 'outline'}>
                  {data.marketDemand?.toUpperCase()}
                </Badge>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {data.growthProjection}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="h-5 w-5 text-purple-600" />
                <span className="font-medium dark:text-gray-100">Top Skills</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {data.topSkills?.slice(0, 4).map((skill: string, index: number) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {skill}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="dark:text-gray-100">Competitor Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.competitorSalaries?.map((comp: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg dark:border-gray-600">
                  <div className="flex items-center gap-3">
                    <Building className="h-5 w-5 text-gray-600" />
                    <span className="font-medium dark:text-gray-100">{comp.company}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-medium dark:text-gray-100">{comp.range}</p>
                    <div className="flex gap-1">
                      {comp.benefits?.slice(0, 2).map((benefit: string, idx: number) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {benefit}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderSkillsData = (data: any) => {
    if (!data) return null;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 dark:text-gray-100">
                <Brain className="h-5 w-5" />
                Current Skills
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {data.currentSkills?.map((skill: string, index: number) => (
                  <Badge key={index} variant="default">
                    {skill}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 dark:text-gray-100">
                <Zap className="h-5 w-5" />
                In-Demand Skills
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {data.inDemandSkills?.map((skill: string, index: number) => (
                  <Badge key={index} variant="secondary">
                    {skill}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 dark:text-gray-100">
              <Target className="h-5 w-5" />
              Skills Gap Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.skillGaps?.map((gap: any, index: number) => (
                <div key={index} className="border rounded-lg p-4 dark:border-gray-600">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium dark:text-gray-100">{gap.skill}</span>
                    <Badge variant={gap.importance === 'critical' ? 'destructive' : gap.importance === 'high' ? 'default' : 'secondary'}>
                      {gap.importance}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{gap.learningPath}</p>
                  <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                    <span>⏱️ {gap.timeToAcquire}</span>
                    <span>📚 {gap.resources?.length || 0} resources</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {data.careerProgression && (
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 dark:text-gray-100">
                <Award className="h-5 w-5" />
                Career Progression
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Current Level</p>
                  <p className="font-medium dark:text-gray-100">{data.careerProgression.currentLevel}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Next Level</p>
                  <p className="font-medium dark:text-gray-100">{data.careerProgression.nextLevel}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Timeframe</p>
                  <p className="font-medium dark:text-gray-100">{data.careerProgression.timeframe}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Salary Increase</p>
                  <p className="font-medium text-green-600 dark:text-green-400">{data.careerProgression.salaryIncrease}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderCompaniesData = (data: any) => {
    if (!data?.companies) return null;

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {data.companies.map((company: any, index: number) => (
          <Card key={index} className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 dark:text-gray-100">
                <Building className="h-5 w-5" />
                {company.companyName}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Industry</p>
                  <p className="font-medium dark:text-gray-100">{company.industry}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Size</p>
                  <p className="font-medium dark:text-gray-100">{company.size}</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Culture Metrics</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm dark:text-gray-300">Work-Life Balance</span>
                    <div className="flex items-center gap-2">
                      <Progress value={company.culture?.workLifeBalance * 20} className="w-20" />
                      <span className="text-sm dark:text-gray-300">{company.culture?.workLifeBalance}/5</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm dark:text-gray-300">Career Growth</span>
                    <div className="flex items-center gap-2">
                      <Progress value={company.culture?.careerGrowth * 20} className="w-20" />
                      <span className="text-sm dark:text-gray-300">{company.culture?.careerGrowth}/5</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm dark:text-gray-300">Compensation</span>
                    <div className="flex items-center gap-2">
                      <Progress value={company.culture?.compensation * 20} className="w-20" />
                      <span className="text-sm dark:text-gray-300">{company.culture?.compensation}/5</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Response Rate</p>
                  <p className="font-medium dark:text-gray-100">{company.responseRate}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Interview Difficulty</p>
                  <Badge variant={company.interviewDifficulty === 'hard' ? 'destructive' : company.interviewDifficulty === 'medium' ? 'default' : 'secondary'}>
                    {company.interviewDifficulty}
                  </Badge>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Hiring Patterns</p>
                <div className="flex items-center gap-2">
                  <Badge variant={company.hiringTrends === 'growing' ? 'default' : company.hiringTrends === 'stable' ? 'secondary' : 'destructive'}>
                    {company.hiringTrends}
                  </Badge>
                  <span className="text-sm dark:text-gray-300">{company.openPositions} open positions</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderTrendsData = (data: any) => {
    if (!data) return null;

    return (
      <div className="space-y-6">
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 dark:text-gray-100">
              <TrendingUp className="h-5 w-5" />
              Industry Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.industryTrends?.map((trend: any, index: number) => (
                <div key={index} className="border rounded-lg p-3 dark:border-gray-600">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium dark:text-gray-100">{trend.trend}</span>
                    <Badge variant={trend.impact === 'high' ? 'default' : trend.impact === 'medium' ? 'secondary' : 'outline'}>
                      {trend.impact} impact
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Timeframe: {trend.timeframe}</p>
                  <div className="flex flex-wrap gap-1">
                    {trend.affectedRoles?.map((role: string, idx: number) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {role}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 dark:text-gray-100">
              <Users className="h-5 w-5" />
              Remote Work Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{data.remoteWorkTrends?.remotePercentage}%</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Remote</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{data.remoteWorkTrends?.hybridPercentage}%</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Hybrid</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">{data.remoteWorkTrends?.onsitePercentage}%</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">On-site</p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm dark:text-gray-300">
                <strong>Salary Impact:</strong> {data.remoteWorkTrends?.salaryImpact}
              </p>
              <p className="text-sm dark:text-gray-300">
                <strong>Location Flexibility:</strong> {data.remoteWorkTrends?.locationFlexibility}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 dark:text-gray-100">
              <BarChart3 className="h-5 w-5" />
              Future Outlook
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Job Growth</p>
                <p className="font-medium text-green-600 dark:text-green-400">{data.futureOutlook?.jobGrowth}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Automation Risk</p>
                <Badge variant={data.futureOutlook?.automationRisk === 'low' ? 'default' : data.futureOutlook?.automationRisk === 'medium' ? 'secondary' : 'destructive'}>
                  {data.futureOutlook?.automationRisk}
                </Badge>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Emerging Roles</p>
              <div className="flex flex-wrap gap-1">
                {data.futureOutlook?.newRoleEmergence?.map((role: string, index: number) => (
                  <Badge key={index} variant="secondary">
                    {role}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen dark:bg-gray-900">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation />
      
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold dark:text-gray-100 mb-2">Market Intelligence</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Get comprehensive insights into job market trends, salary data, and career opportunities
          </p>
        </div>

        {/* Analysis Filters */}
        <Card className="mb-8 dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="dark:text-gray-100">Analysis Parameters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div>
                <Label className="dark:text-gray-200">Job Title</Label>
                <Input
                  value={analysisFilters.jobTitle}
                  onChange={(e) => setAnalysisFilters({...analysisFilters, jobTitle: e.target.value})}
                  placeholder="e.g. Software Engineer"
                  className="dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <div>
                <Label className="dark:text-gray-200">Industry</Label>
                <Select value={analysisFilters.industry} onValueChange={(value) => setAnalysisFilters({...analysisFilters, industry: value})}>
                  <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600">
                    <SelectValue placeholder="Select industry" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                    <SelectItem value="technology">Technology</SelectItem>
                    <SelectItem value="finance">Finance</SelectItem>
                    <SelectItem value="healthcare">Healthcare</SelectItem>
                    <SelectItem value="consulting">Consulting</SelectItem>
                    <SelectItem value="retail">Retail</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="dark:text-gray-200">Location</Label>
                <Input
                  value={analysisFilters.location}
                  onChange={(e) => setAnalysisFilters({...analysisFilters, location: e.target.value})}
                  placeholder="e.g. San Francisco"
                  className="dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <div>
                <Label className="dark:text-gray-200">Experience Level</Label>
                <Select value={analysisFilters.experienceLevel} onValueChange={(value) => setAnalysisFilters({...analysisFilters, experienceLevel: value})}>
                  <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600">
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                    <SelectItem value="entry">Entry Level</SelectItem>
                    <SelectItem value="mid">Mid Level</SelectItem>
                    <SelectItem value="senior">Senior Level</SelectItem>
                    <SelectItem value="executive">Executive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Analysis Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid grid-cols-5 w-full dark:bg-gray-800">
            <TabsTrigger value="overview" onClick={() => handleAnalyzeMarket('overview')}>Overview</TabsTrigger>
            <TabsTrigger value="salary" onClick={() => handleAnalyzeMarket('salary')}>Salary</TabsTrigger>
            <TabsTrigger value="skills" onClick={() => handleAnalyzeMarket('skills')}>Skills</TabsTrigger>
            <TabsTrigger value="companies" onClick={handleAnalyzeCompanies}>Companies</TabsTrigger>
            <TabsTrigger value="trends" onClick={() => handleAnalyzeMarket('trends')}>Trends</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 dark:text-gray-100">
                  <BarChart3 className="h-5 w-5" />
                  Market Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                {insightsMutation.isPending ? (
                  <div className="text-center py-8 dark:text-gray-400">Analyzing market data...</div>
                ) : insightsMutation.data ? (
                  renderInsightsData(insightsMutation.data)
                ) : (
                  <div className="text-center py-8">
                    <BarChart3 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-500 dark:text-gray-400 mb-4">No analysis data yet</p>
                    <Button onClick={() => handleAnalyzeMarket('overview')}>
                      Generate Market Insights
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="salary">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 dark:text-gray-100">
                  <DollarSign className="h-5 w-5" />
                  Salary Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                {salaryMutation.isPending ? (
                  <div className="text-center py-8 dark:text-gray-400">Analyzing salary data...</div>
                ) : salaryMutation.data ? (
                  renderSalaryData(salaryMutation.data)
                ) : (
                  <div className="text-center py-8">
                    <DollarSign className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-500 dark:text-gray-400 mb-4">No salary analysis yet</p>
                    <Button onClick={() => handleAnalyzeMarket('salary')}>
                      Analyze Salary Data
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="skills">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 dark:text-gray-100">
                  <Brain className="h-5 w-5" />
                  Skills Gap Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                {skillsMutation.isPending ? (
                  <div className="text-center py-8 dark:text-gray-400">Analyzing skills gap...</div>
                ) : skillsMutation.data ? (
                  renderSkillsData(skillsMutation.data)
                ) : (
                  <div className="text-center py-8">
                    <Brain className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-500 dark:text-gray-400 mb-4">No skills analysis yet</p>
                    <Button onClick={() => handleAnalyzeMarket('skills')}>
                      Analyze Skills Gap
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="companies">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 dark:text-gray-100">
                  <Building className="h-5 w-5" />
                  Company Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                {companiesMutation.isPending ? (
                  <div className="text-center py-8 dark:text-gray-400">Analyzing company data...</div>
                ) : companiesMutation.data ? (
                  renderCompaniesData(companiesMutation.data)
                ) : (
                  <div className="text-center py-8">
                    <Building className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-500 dark:text-gray-400 mb-4">No company analysis yet</p>
                    <Button onClick={handleAnalyzeCompanies}>
                      Analyze Top Companies
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trends">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 dark:text-gray-100">
                  <TrendingUp className="h-5 w-5" />
                  Market Trends
                </CardTitle>
              </CardHeader>
              <CardContent>
                {trendsMutation.isPending ? (
                  <div className="text-center py-8 dark:text-gray-400">Analyzing market trends...</div>
                ) : trendsMutation.data ? (
                  renderTrendsData(trendsMutation.data)
                ) : (
                  <div className="text-center py-8">
                    <TrendingUp className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-500 dark:text-gray-400 mb-4">No trends analysis yet</p>
                    <Button onClick={() => handleAnalyzeMarket('trends')}>
                      Analyze Market Trends
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Quick Actions */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Button variant="outline" className="p-6 h-auto flex flex-col items-center gap-2" onClick={() => handleAnalyzeMarket('overview')}>
            <BarChart3 className="h-8 w-8" />
            <span>Quick Market Overview</span>
          </Button>
          
          <Button variant="outline" className="p-6 h-auto flex flex-col items-center gap-2" onClick={() => handleAnalyzeMarket('salary')}>
            <DollarSign className="h-8 w-8" />
            <span>Salary Benchmark</span>
          </Button>
          
          <Button variant="outline" className="p-6 h-auto flex flex-col items-center gap-2" onClick={() => handleAnalyzeMarket('skills')}>
            <Brain className="h-8 w-8" />
            <span>Skills Assessment</span>
          </Button>
        </div>
      </div>
    </div>
  );
}