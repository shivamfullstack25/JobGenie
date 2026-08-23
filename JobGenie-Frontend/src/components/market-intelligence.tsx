import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Progress} from "@/components/ui/progress";
import {Badge} from "@/components/ui/badge";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";

export default function MarketIntelligence() {
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [showTrends, setShowTrends] = useState(false);
  const [showCompanyInsights, setShowCompanyInsights] = useState(false);

  const { data: marketTrends } = useQuery({
    queryKey: ["/api/market/trends", industry, location],
    enabled: showTrends && !!industry && !!location,
  });

  const { data: companyInsights } = useQuery({
    queryKey: ["/api/company/insights", companyName],
    enabled: showCompanyInsights && !!companyName,
  });

  const handleAnalyzeTrends = () => {
    if (industry && location) {
      setShowTrends(true);
    }
  };

  const handleAnalyzeCompany = () => {
    if (companyName) {
      setShowCompanyInsights(true);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getDemandBadgeColor = (level: string) => {
    switch (level) {
      case "high": return "bg-green-100 text-green-800";
      case "medium": return "bg-yellow-100 text-yellow-800";
      case "low": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "increasing": return "fas fa-arrow-up text-green-500";
      case "decreasing": return "fas fa-arrow-down text-red-500";
      case "stable": return "fas fa-minus text-yellow-500";
      default: return "fas fa-minus text-gray-500";
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Market Intelligence Hub</h2>
        <p className="text-gray-600">
          Get real-time insights on job market trends, company analysis, and strategic application guidance
        </p>
      </div>

      <Tabs defaultValue="trends" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="trends" className="flex items-center space-x-2">
            <i className="fas fa-chart-line"></i>
            <span>Market Trends</span>
          </TabsTrigger>
          <TabsTrigger value="companies" className="flex items-center space-x-2">
            <i className="fas fa-building"></i>
            <span>Company Insights</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trends" className="space-y-6">
          {/* Market Trends Analysis */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <i className="fas fa-chart-line mr-2 text-blue-600"></i>
                Industry Market Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="industry">Industry</Label>
                  <Input
                    id="industry"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="e.g., Technology, Finance, Healthcare"
                  />
                </div>
                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g., San Francisco, New York, Remote"
                  />
                </div>
              </div>
              <Button 
                onClick={handleAnalyzeTrends}
                disabled={!industry || !location}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <i className="fas fa-search mr-2"></i>
                Analyze Market Trends
              </Button>
            </CardContent>
          </Card>

          {/* Market Trends Results */}
          {marketTrends && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <i className="fas fa-chart-bar mr-2 text-green-600"></i>
                    Market Overview
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-700">
                        {marketTrends.industryGrowth}%
                      </div>
                      <div className="text-sm text-gray-600">Industry Growth</div>
                    </div>
                    <div className="text-center p-3 bg-purple-50 rounded-lg">
                      <div className="text-2xl font-bold text-purple-700">
                        {marketTrends.competitionLevel}%
                      </div>
                      <div className="text-sm text-gray-600">Competition Level</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Salary Trend</span>
                      <div className="flex items-center">
                        <i className={getTrendIcon(marketTrends.salaryTrend)}></i>
                        <span className="ml-2 text-sm capitalize">{marketTrends.salaryTrend}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Demand Level</span>
                      <Badge className={getDemandBadgeColor(marketTrends.demandLevel)}>
                        {marketTrends.demandLevel.toUpperCase()}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Hiring Timeline</span>
                      <span className="text-sm text-gray-600">{marketTrends.hiringTimeframe}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <i className="fas fa-fire mr-2 text-orange-600"></i>
                    Hot Skills & Roles
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">In-Demand Skills</h4>
                    <div className="flex flex-wrap gap-2">
                      {marketTrends.hotSkills?.map((skill: string, index: number) => (
                        <Badge key={index} variant="secondary" className="bg-orange-100 text-orange-800">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Emerging Roles</h4>
                    <div className="space-y-2">
                      {marketTrends.emergingRoles?.map((role: string, index: number) => (
                        <div key={index} className="flex items-center text-sm">
                          <i className="fas fa-star text-yellow-500 mr-2"></i>
                          {role}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="companies" className="space-y-6">
          {/* Company Analysis */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <i className="fas fa-building mr-2 text-purple-600"></i>
                Company Intelligence
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="company">Company Name</Label>
                <Input
                  id="company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g., Google, Microsoft, Startup Inc"
                />
              </div>
              <Button 
                onClick={handleAnalyzeCompany}
                disabled={!companyName}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <i className="fas fa-search mr-2"></i>
                Analyze Company
              </Button>
            </CardContent>
          </Card>

          {/* Company Insights Results */}
          {companyInsights && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <i className="fas fa-chart-pie mr-2 text-blue-600"></i>
                    {companyInsights.companyName} Scores
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Company Culture</span>
                        <span className={getScoreColor(companyInsights.cultureScore)}>
                          {companyInsights.cultureScore}%
                        </span>
                      </div>
                      <Progress value={companyInsights.cultureScore} className="h-2" />
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Work-Life Balance</span>
                        <span className={getScoreColor(companyInsights.workLifeBalance)}>
                          {companyInsights.workLifeBalance}%
                        </span>
                      </div>
                      <Progress value={companyInsights.workLifeBalance} className="h-2" />
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Career Growth</span>
                        <span className={getScoreColor(companyInsights.careerGrowth)}>
                          {companyInsights.careerGrowth}%
                        </span>
                      </div>
                      <Progress value={companyInsights.careerGrowth} className="h-2" />
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Compensation</span>
                        <span className={getScoreColor(companyInsights.compensation)}>
                          {companyInsights.compensation}%
                        </span>
                      </div>
                      <Progress value={companyInsights.compensation} className="h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <i className="fas fa-user-tie mr-2 text-green-600"></i>
                    Application Intelligence
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-700">
                        {companyInsights.responseRate}%
                      </div>
                      <div className="text-sm text-gray-600">Response Rate</div>
                    </div>
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <div className="text-lg font-bold text-blue-700 capitalize">
                        {companyInsights.interviewDifficulty}
                      </div>
                      <div className="text-sm text-gray-600">Interview Level</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Hiring Patterns</h4>
                    <div className="space-y-2">
                      {companyInsights.hiringPatterns?.map((pattern: string, index: number) => (
                        <div key={index} className="flex items-start text-sm">
                          <i className="fas fa-lightbulb text-yellow-500 mr-2 mt-0.5"></i>
                          {pattern}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}