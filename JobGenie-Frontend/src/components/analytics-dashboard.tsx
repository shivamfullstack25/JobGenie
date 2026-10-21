import React, {useState} from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useApiCache } from '@/hooks/useCache';
import {TrendingUp, TrendingDown, Users, Briefcase, Target, BarChart3, Activity, Clock, Download, RefreshCw, MapPin, Award, Brain, Zap} from 'lucide-react';

interface AnalyticsData {
  overview: {
    totalApplications: number;
    successRate: number;
    averageResponseTime: number;
    activeJobs: number;
    totalUsers: number;
    aiAnalysisCount: number;
  };
  trends: {
    applications: Array<{ date: string; count: number; success: number }>;
    jobMatches: Array<{ date: string; matches: number; quality: number }>;
    userActivity: Array<{ date: string; active: number; new: number }>;
  };
  performance: {
    topSkills: Array<{ skill: string; demand: number; growth: number }>;
    industryTrends: Array<{ industry: string; jobs: number; avgSalary: number }>;
    locationData: Array<{ location: string; jobs: number; competition: number }>;
  };
  predictions: {
    nextWeekApplications: number;
    marketTrends: Array<{ trend: string; impact: number; confidence: number }>;
    recommendedActions: Array<{ action: string; priority: 'high' | 'medium' | 'low'; impact: number }>;
  };
  realtime: {
    activeUsers: number;
    currentApplications: number;
    aiProcessing: number;
    systemLoad: number;
  };
}

export const AnalyticsDashboard: React.FC = () => {
  const [selectedTimeRange, setSelectedTimeRange] = useState('7d');
  const [refreshing, setRefreshing] = useState(false);

  // Real-time data from WebSocket
  const { isConnected } = useWebSocket({
    onMessage: (message) => {
      if (message.type === 'analytics_update') {
        // Handle real-time analytics updates
        console.log('Analytics update received:', message.data);
      }
    }
  });

  // Cached analytics data
  const { 
    data: analyticsData, 
    loading, 
    error, 
    refresh 
  } = useApiCache<AnalyticsData>(
    `analytics/${selectedTimeRange}`,
    async () => {
      const response = await fetch(`/api/analytics?timeRange=${selectedTimeRange}`);
      return response.json();
    },
    2 * 60 * 1000 // 2 minutes cache
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const exportData = () => {
    // Implementation for exporting analytics data
    console.log('Exporting analytics data...');
  };

  // Calculate percentage changes
  const calculateChange = (current: number, previous: number): { value: number; isPositive: boolean } => {
    const change = ((current - previous) / previous) * 100;
    return { value: Math.abs(change), isPositive: change >= 0 };
  };

  if (loading && !analyticsData) {
    return (
      <div className="p-6">
        <LoadingSpinner size="lg" type="ai-analysis" text="Loading analytics..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-red-600">Failed to load analytics data</p>
            <Button onClick={handleRefresh} className="mt-4">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Real-time insights and performance metrics
            {isConnected && (
              <Badge variant="outline" className="ml-2 text-green-600">
                <Activity className="h-3 w-3 mr-1" />
                Live
              </Badge>
            )}
          </p>
        </div>
        
        <div className="flex space-x-2">
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value)}
            className="px-3 py-2 border rounded-md"
          >
            <option value="1d">Last 24h</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 3 months</option>
          </select>
          
          <Button 
            variant="outline" 
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          
          <Button variant="outline" onClick={exportData}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {((analyticsData?.performance as any)?.isSampleData ||
        (analyticsData?.predictions as any)?.isSampleData ||
        (analyticsData?.trends as any)?.isSampleData) && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Trend charts, skill demand, industry/location benchmarks, and forecasts below are
          illustrative sample data — they require an events/time-series store and a
          labor-market data source this deployment doesn't have yet. Overview counts above are
          live.
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <OverviewCard
          title="Total Applications"
          value={analyticsData?.overview.totalApplications || 0}
          change={calculateChange(452, 387)}
          icon={<Briefcase className="h-6 w-6" />}
          color="blue"
        />
        
        <OverviewCard
          title="Success Rate"
          value={`${analyticsData?.overview.successRate || 0}%`}
          change={calculateChange(23.5, 19.2)}
          icon={<Target className="h-6 w-6" />}
          color="green"
        />
        
        <OverviewCard
          title="Active Users"
          value={analyticsData?.realtime.activeUsers || 0}
          change={calculateChange(1247, 1156)}
          icon={<Users className="h-6 w-6" />}
          color="purple"
        />
        
        <OverviewCard
          title="AI Analyses"
          value={analyticsData?.overview.aiAnalysisCount || 0}
          change={calculateChange(89, 67)}
          icon={<Brain className="h-6 w-6" />}
          color="orange"
        />
      </div>

      {/* Main Analytics Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="predictions">Predictions</TabsTrigger>
          <TabsTrigger value="realtime">Real-time</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Application Success Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="h-5 w-5 mr-2" />
                  Application Success Trends
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ApplicationTrendChart data={analyticsData?.trends.applications || []} />
              </CardContent>
            </Card>

            {/* Job Match Quality */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Target className="h-5 w-5 mr-2" />
                  Job Match Quality
                </CardTitle>
              </CardHeader>
              <CardContent>
                <JobMatchChart data={analyticsData?.trends.jobMatches || []} />
              </CardContent>
            </Card>
          </div>

          {/* Skills Analysis */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Award className="h-5 w-5 mr-2" />
                Top Skills in Demand
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SkillsAnalysis skills={analyticsData?.performance.topSkills || []} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Industry Trends */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="h-5 w-5 mr-2" />
                  Industry Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <IndustryChart data={analyticsData?.performance.industryTrends || []} />
              </CardContent>
            </Card>

            {/* Location Analysis */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <MapPin className="h-5 w-5 mr-2" />
                  Geographic Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <LocationChart data={analyticsData?.performance.locationData || []} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="predictions" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Predictions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Brain className="h-5 w-5 mr-2" />
                  AI Predictions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PredictionsPanel predictions={analyticsData?.predictions || {}} />
              </CardContent>
            </Card>

            {/* Recommended Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Zap className="h-5 w-5 mr-2" />
                  Recommended Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RecommendationsPanel 
                  recommendations={analyticsData?.predictions.recommendedActions || []} 
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="realtime" className="space-y-6">
          <RealtimeMonitor data={analyticsData?.realtime || {}} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Overview Card Component
interface OverviewCardProps {
  title: string;
  value: string | number;
  change: { value: number; isPositive: boolean };
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'purple' | 'orange';
}

const OverviewCard: React.FC<OverviewCardProps> = ({ title, value, change, icon, color }) => {
  const colorClasses = {
    blue: 'text-blue-600 bg-blue-50',
    green: 'text-green-600 bg-green-50',
    purple: 'text-purple-600 bg-purple-50',
    orange: 'text-orange-600 bg-orange-50'
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
            {icon}
          </div>
          <div className="flex items-center space-x-1">
            {change.isPositive ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
            <span className={`text-sm font-medium ${change.isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {change.value.toFixed(1)}%
            </span>
          </div>
        </div>
        
        <div className="mt-4">
          <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
          <p className="text-sm text-gray-600">{title}</p>
        </div>
      </CardContent>
    </Card>
  );
};

// Chart Components (simplified for brevity)
const ApplicationTrendChart: React.FC<{ data: any[] }> = () => (
  <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
    <p className="text-gray-500">Application Trend Chart</p>
  </div>
);

const JobMatchChart: React.FC<{ data: any[] }> = () => (
  <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
    <p className="text-gray-500">Job Match Quality Chart</p>
  </div>
);

const SkillsAnalysis: React.FC<{ skills: any[] }> = ({ skills }) => (
  <div className="space-y-3">
    {skills.slice(0, 5).map((skill, index) => (
      <div key={index} className="flex items-center justify-between">
        <span className="font-medium">{skill.skill}</span>
        <div className="flex items-center space-x-2">
          <Progress value={skill.demand} className="w-24" />
          <span className="text-sm text-gray-600">{skill.demand}%</span>
        </div>
      </div>
    ))}
  </div>
);

const IndustryChart: React.FC<{ data: any[] }> = () => (
  <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
    <p className="text-gray-500">Industry Performance Chart</p>
  </div>
);

const LocationChart: React.FC<{ data: any[] }> = () => (
  <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
    <p className="text-gray-500">Geographic Distribution Chart</p>
  </div>
);

const PredictionsPanel: React.FC<{ predictions: any }> = ({ predictions }) => (
  <div className="space-y-4">
    <div className="p-4 bg-blue-50 rounded-lg">
      <h4 className="font-medium text-blue-900">Next Week Forecast</h4>
      <p className="text-2xl font-bold text-blue-700">{predictions.nextWeekApplications || 0}</p>
      <p className="text-sm text-blue-600">Expected applications</p>
    </div>
    
    <div className="space-y-2">
      <h4 className="font-medium">Market Trends</h4>
      {(predictions.marketTrends || []).map((trend: any, index: number) => (
        <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
          <span className="text-sm">{trend.trend}</span>
          <Badge variant={trend.impact > 0 ? 'default' : 'destructive'}>
            {trend.confidence}% confidence
          </Badge>
        </div>
      ))}
    </div>
  </div>
);

const RecommendationsPanel: React.FC<{ recommendations: any[] }> = ({ recommendations }) => (
  <div className="space-y-3">
    {recommendations.map((rec, index) => (
      <div key={index} className="p-3 border rounded-lg">
        <div className="flex justify-between items-start">
          <p className="text-sm font-medium">{rec.action}</p>
          <Badge 
            variant={rec.priority === 'high' ? 'destructive' : rec.priority === 'medium' ? 'default' : 'secondary'}
          >
            {rec.priority}
          </Badge>
        </div>
        <div className="mt-2">
          <Progress value={rec.impact} className="w-full" />
          <p className="text-xs text-gray-500 mt-1">Impact: {rec.impact}%</p>
        </div>
      </div>
    ))}
  </div>
);

const RealtimeMonitor: React.FC<{ data: any }> = ({ data }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
    <Card>
      <CardContent className="p-6 text-center">
        <Activity className="h-8 w-8 mx-auto text-green-600 mb-2" />
        <p className="text-2xl font-bold">{data.activeUsers || 0}</p>
        <p className="text-sm text-gray-600">Active Users</p>
      </CardContent>
    </Card>
    
    <Card>
      <CardContent className="p-6 text-center">
        <Clock className="h-8 w-8 mx-auto text-blue-600 mb-2" />
        <p className="text-2xl font-bold">{data.currentApplications || 0}</p>
        <p className="text-sm text-gray-600">Applications in Progress</p>
      </CardContent>
    </Card>
    
    <Card>
      <CardContent className="p-6 text-center">
        <Brain className="h-8 w-8 mx-auto text-purple-600 mb-2" />
        <p className="text-2xl font-bold">{data.aiProcessing || 0}</p>
        <p className="text-sm text-gray-600">AI Tasks Running</p>
      </CardContent>
    </Card>
    
    <Card>
      <CardContent className="p-6 text-center">
        <BarChart3 className="h-8 w-8 mx-auto text-orange-600 mb-2" />
        <p className="text-2xl font-bold">{data.systemLoad || 0}%</p>
        <p className="text-sm text-gray-600">System Load</p>
      </CardContent>
    </Card>
  </div>
);

export default AnalyticsDashboard; 