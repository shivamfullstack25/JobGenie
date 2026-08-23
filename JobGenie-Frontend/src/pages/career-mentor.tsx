import {useEffect, useRef, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Progress} from "@/components/ui/progress";
import {useToast} from "@/hooks/use-toast";
import {apiRequest} from "@/lib/queryClient";
import Navigation from "@/components/navigation";

interface MentorMessage {
  id: string;
  type: 'user' | 'mentor';
  content: string;
  timestamp: Date;
  personality?: 'supportive' | 'challenging' | 'analytical' | 'motivational';
  actionItems?: string[];
  resources?: any[];
  followUpQuestions?: string[];
}

interface CareerGoal {
  id: string;
  title: string;
  description: string;
  targetDate: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'paused';
  progress: number;
  milestones: any[];
}

export default function CareerMentor() {
  const [activeTab, setActiveTab] = useState("chat");
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<MentorMessage[]>([]);
  const [careerGoals, setCareerGoals] = useState<CareerGoal[]>([]);
  const [gapAnalysis, setGapAnalysis] = useState<any>(null);
  const [interviewPrep, setInterviewPrep] = useState<any>(null);
  const [prepJobTitle, setPrepJobTitle] = useState("");
  const [prepCompany, setPrepCompany] = useState("");
  const [goalInput, setGoalInput] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const chatMutation = useMutation({
    mutationFn: async (data: { message: string }) => {
      // apiRequest resolves to the raw fetch Response, not parsed JSON (see
      // queryClient.ts) — without calling .json(), `response` in onSuccess below
      // is a Response object and response.response/mentorPersonality/etc are all
      // undefined, so the mentor's reply never actually renders.
      const res = await apiRequest("/api/career-mentor/chat", {
        method: "POST",
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: (response) => {
      const mentorMessage: MentorMessage = {
        id: `mentor-${Date.now()}`,
        type: 'mentor',
        content: response.response,
        timestamp: new Date(),
        personality: response.mentorPersonality,
        actionItems: response.actionItems,
        resources: response.resources,
        followUpQuestions: response.followUpQuestions
      };
      setChatHistory(prev => [...prev, mentorMessage]);
    },
    onError: (error: any) => {
      toast({
        title: "Chat Error",
        description: error.message || "Failed to get career advice",
        variant: "destructive",
      });
    },
  });

  const careerPlanMutation = useMutation({
    mutationFn: async (goals: string[]) => {
      const res = await apiRequest("/api/career-mentor/career-plan", {
        method: "POST",
        body: JSON.stringify({ goals }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      setCareerGoals(data);
      toast({
        title: "Career Plan Generated",
        description: `Created ${data.length} career goals with actionable milestones`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Plan Generation Failed",
        description: error.message || "Failed to generate career plan",
        variant: "destructive",
      });
    },
  });

  const { data: gapAnalysisData, refetch: refetchGapAnalysis } = useQuery({
    queryKey: ["/api/career-mentor/gap-analysis"],
    enabled: activeTab === "gap-analysis",
  });

  const interviewPrepMutation = useMutation({
    mutationFn: async (data: { jobTitle: string; company: string }) => {
      const res = await apiRequest("/api/career-mentor/interview-prep", {
        method: "POST",
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: (data) => {
      setInterviewPrep(data);
      toast({
        title: "Interview Prep Ready",
        description: "Generated comprehensive interview preparation materials",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Prep Generation Failed",
        description: error.message || "Failed to generate interview prep",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (gapAnalysisData) {
      setGapAnalysis(gapAnalysisData);
    }
  }, [gapAnalysisData]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleSendMessage = () => {
    if (!message.trim()) return;

    const userMessage: MentorMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: message,
      timestamp: new Date()
    };

    setChatHistory(prev => [...prev, userMessage]);
    chatMutation.mutate({ message });
    setMessage("");
  };

  const handleQuickQuestion = (question: string) => {
    setMessage(question);
    setTimeout(() => handleSendMessage(), 100);
  };

  const addGoal = () => {
    if (goalInput.trim() && !goals.includes(goalInput.trim())) {
      setGoals(prev => [...prev, goalInput.trim()]);
      setGoalInput("");
    }
  };

  const removeGoal = (goal: string) => {
    setGoals(prev => prev.filter(g => g !== goal));
  };

  const generateCareerPlan = () => {
    if (goals.length === 0) {
      toast({
        title: "No Goals Specified",
        description: "Please add at least one career goal",
        variant: "destructive",
      });
      return;
    }
    careerPlanMutation.mutate(goals);
  };

  const generateInterviewPrep = () => {
    if (!prepJobTitle || !prepCompany) {
      toast({
        title: "Missing Information",
        description: "Please provide both job title and company",
        variant: "destructive",
      });
      return;
    }
    interviewPrepMutation.mutate({ jobTitle: prepJobTitle, company: prepCompany });
  };

  const getPersonalityIcon = (personality?: string) => {
    switch (personality) {
      case 'supportive': return 'fas fa-heart text-green-600';
      case 'challenging': return 'fas fa-fire text-red-600';
      case 'analytical': return 'fas fa-chart-line text-blue-600';
      case 'motivational': return 'fas fa-rocket text-orange-600';
      default: return 'fas fa-user-tie text-gray-600';
    }
  };

  const quickQuestions = [
    "How can I improve my job search strategy?",
    "What skills should I develop for my career?",
    "How do I negotiate a better salary?",
    "What's the best way to prepare for interviews?",
    "How can I transition to a new industry?",
    "What are the current trends in my field?"
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <i className="fas fa-user-tie mr-3 text-primary-600"></i>
            Career Mentor
          </h1>
          <p className="text-gray-600 mt-2">
            Get personalized career guidance powered by AI analysis of your job search data
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="chat" className="flex items-center">
              <i className="fas fa-comments mr-2"></i>
              AI Chat
            </TabsTrigger>
            <TabsTrigger value="career-plan" className="flex items-center">
              <i className="fas fa-map-marked-alt mr-2"></i>
              Career Plan
            </TabsTrigger>
            <TabsTrigger value="gap-analysis" className="flex items-center">
              <i className="fas fa-search mr-2"></i>
              Gap Analysis
            </TabsTrigger>
            <TabsTrigger value="interview-prep" className="flex items-center">
              <i className="fas fa-microphone mr-2"></i>
              Interview Prep
            </TabsTrigger>
          </TabsList>

          {/* AI Chat Tab */}
          <TabsContent value="chat" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-3">
                <Card className="h-[600px] flex flex-col">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <i className="fas fa-robot mr-2 text-primary-600"></i>
                      Career Mentor Chat
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                      {chatHistory.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <i className="fas fa-comments text-4xl mb-4"></i>
                          <p>Start a conversation with your AI career mentor</p>
                          <p className="text-sm">Ask about job search strategies, career development, or any career-related questions</p>
                        </div>
                      ) : (
                        chatHistory.map((msg) => (
                          <div
                            key={msg.id}
                            className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[80%] rounded-lg p-4 ${
                                msg.type === 'user'
                                  ? 'bg-primary-600 text-white'
                                  : 'bg-gray-100 text-gray-900'
                              }`}
                            >
                              {msg.type === 'mentor' && (
                                <div className="flex items-center mb-2">
                                  <i className={`${getPersonalityIcon(msg.personality)} mr-2`}></i>
                                  <span className="text-sm font-medium capitalize">
                                    {msg.personality} Mentor
                                  </span>
                                </div>
                              )}
                              
                              <p className="whitespace-pre-wrap">{msg.content}</p>
                              
                              {msg.actionItems && msg.actionItems.length > 0 && (
                                <div className="mt-3">
                                  <p className="font-medium mb-2">Action Items:</p>
                                  <ul className="list-disc list-inside space-y-1">
                                    {msg.actionItems.map((item, index) => (
                                      <li key={index} className="text-sm">{item}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              
                              {msg.resources && msg.resources.length > 0 && (
                                <div className="mt-3">
                                  <p className="font-medium mb-2">Resources:</p>
                                  <div className="space-y-1">
                                    {msg.resources.map((resource, index) => (
                                      <div key={index} className="text-sm">
                                        <Badge variant="outline" className="mr-2">
                                          {resource.type}
                                        </Badge>
                                        <span className="font-medium">{resource.title}</span>
                                        <p className="text-xs mt-1">{resource.description}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {msg.followUpQuestions && msg.followUpQuestions.length > 0 && (
                                <div className="mt-3">
                                  <p className="font-medium mb-2">Follow-up Questions:</p>
                                  <div className="space-y-1">
                                    {msg.followUpQuestions.map((question, index) => (
                                      <button
                                        key={index}
                                        onClick={() => handleQuickQuestion(question)}
                                        className="block text-left text-sm text-blue-600 hover:text-blue-800 underline"
                                      >
                                        {question}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              <div className="text-xs opacity-70 mt-2">
                                {msg.timestamp.toLocaleTimeString()}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                      <div ref={chatEndRef} />
                    </div>
                    
                    <div className="flex space-x-2">
                      <Input
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Ask your career mentor anything..."
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        disabled={chatMutation.isPending}
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={chatMutation.isPending || !message.trim()}
                      >
                        {chatMutation.isPending ? (
                          <i className="fas fa-spinner fa-spin"></i>
                        ) : (
                          <i className="fas fa-paper-plane"></i>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Quick Questions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {quickQuestions.map((question, index) => (
                        <button
                          key={index}
                          onClick={() => handleQuickQuestion(question)}
                          className="w-full text-left text-sm p-2 rounded border hover:bg-gray-50 transition-colors"
                        >
                          {question}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Career Plan Tab */}
          <TabsContent value="career-plan" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <i className="fas fa-bullseye mr-2 text-primary-600"></i>
                  Career Goal Setting
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex space-x-2">
                  <Input
                    value={goalInput}
                    onChange={(e) => setGoalInput(e.target.value)}
                    placeholder="e.g., Get promoted to senior developer in 12 months"
                    onKeyPress={(e) => e.key === 'Enter' && addGoal()}
                  />
                  <Button onClick={addGoal} variant="outline">
                    <i className="fas fa-plus mr-1"></i>
                    Add Goal
                  </Button>
                </div>
                
                {goals.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Your Career Goals:</h4>
                    <div className="space-y-2">
                      {goals.map((goal, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <span className="text-sm">{goal}</span>
                          <button
                            onClick={() => removeGoal(goal)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <i className="fas fa-times"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                    
                    <Button
                      onClick={generateCareerPlan}
                      disabled={careerPlanMutation.isPending}
                      className="w-full"
                    >
                      {careerPlanMutation.isPending ? (
                        <>
                          <i className="fas fa-spinner fa-spin mr-2"></i>
                          Generating Plan...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-magic mr-2"></i>
                          Generate Career Plan
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {careerGoals.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-xl font-semibold">Your Career Plan</h3>
                {careerGoals.map((goal) => (
                  <Card key={goal.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>{goal.title}</span>
                        <Badge variant={goal.status === 'completed' ? 'default' : 'secondary'}>
                          {goal.status.replace('_', ' ')}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-gray-600">{goal.description}</p>
                      
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Progress</span>
                          <span>{goal.progress}%</span>
                        </div>
                        <Progress value={goal.progress} className="w-full" />
                      </div>
                      
                      <div>
                        <p className="font-medium mb-2">Target Date: {new Date(goal.targetDate).toLocaleDateString()}</p>
                      </div>
                      
                      {goal.milestones.length > 0 && (
                        <div>
                          <h4 className="font-medium mb-2">Milestones:</h4>
                          <div className="space-y-2">
                            {goal.milestones.map((milestone: any, index: number) => (
                              <div
                                key={index}
                                className="flex items-center space-x-2 p-2 bg-gray-50 rounded"
                              >
                                <input
                                  type="checkbox"
                                  checked={milestone.completed}
                                  onChange={() => {
                                    // Handle milestone completion
                                  }}
                                />
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{milestone.title}</p>
                                  <p className="text-xs text-gray-600">{milestone.description}</p>
                                </div>
                                <Badge
                                  variant={milestone.priority === 'high' ? 'destructive' : 'outline'}
                                  className="text-xs"
                                >
                                  {milestone.priority}
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
            )}
          </TabsContent>

          {/* Gap Analysis Tab */}
          <TabsContent value="gap-analysis" className="space-y-6">
            {gapAnalysis ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center text-red-600">
                      <i className="fas fa-exclamation-triangle mr-2"></i>
                      Skill Gaps
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {gapAnalysis.skillGaps.length > 0 ? (
                      <div className="space-y-2">
                        {gapAnalysis.skillGaps.map((skill: string, index: number) => (
                          <div key={index} className="p-2 bg-red-50 border border-red-200 rounded">
                            <span className="text-sm text-red-800">{skill}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500">No significant skill gaps identified</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center text-orange-600">
                      <i className="fas fa-briefcase mr-2"></i>
                      Experience Gaps
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {gapAnalysis.experienceGaps.length > 0 ? (
                      <div className="space-y-2">
                        {gapAnalysis.experienceGaps.map((gap: string, index: number) => (
                          <div key={index} className="p-2 bg-orange-50 border border-orange-200 rounded">
                            <span className="text-sm text-orange-800">{gap}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500">No major experience gaps found</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center text-green-600">
                      <i className="fas fa-lightbulb mr-2"></i>
                      Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {gapAnalysis.recommendations.length > 0 ? (
                      <div className="space-y-2">
                        {gapAnalysis.recommendations.map((rec: string, index: number) => (
                          <div key={index} className="p-2 bg-green-50 border border-green-200 rounded">
                            <span className="text-sm text-green-800">{rec}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500">Analysis in progress...</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="text-center py-12">
                  <i className="fas fa-search text-4xl text-gray-300 mb-4"></i>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Analyzing Your Career Profile
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Getting comprehensive gap analysis based on your job applications and market trends
                  </p>
                  <Button onClick={() => refetchGapAnalysis()}>
                    <i className="fas fa-refresh mr-2"></i>
                    Refresh Analysis
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Interview Prep Tab */}
          <TabsContent value="interview-prep" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <i className="fas fa-microphone mr-2 text-primary-600"></i>
                  Interview Preparation Generator
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Job Title</label>
                    <Input
                      value={prepJobTitle}
                      onChange={(e) => setPrepJobTitle(e.target.value)}
                      placeholder="e.g., Senior Software Engineer"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Company</label>
                    <Input
                      value={prepCompany}
                      onChange={(e) => setPrepCompany(e.target.value)}
                      placeholder="e.g., Google"
                    />
                  </div>
                </div>
                
                <Button
                  onClick={generateInterviewPrep}
                  disabled={interviewPrepMutation.isPending}
                  className="w-full"
                >
                  {interviewPrepMutation.isPending ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Generating Prep Materials...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-magic mr-2"></i>
                      Generate Interview Prep
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {interviewPrep && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Common Questions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {interviewPrep.commonQuestions?.map((question: string, index: number) => (
                          <div key={index} className="p-2 bg-gray-50 rounded">
                            <p className="text-sm">{question}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Company-Specific Questions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {interviewPrep.companySpecificQuestions?.map((question: string, index: number) => (
                          <div key={index} className="p-2 bg-blue-50 rounded">
                            <p className="text-sm">{question}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Situational Questions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {interviewPrep.situationalQuestions?.map((question: string, index: number) => (
                          <div key={index} className="p-2 bg-yellow-50 rounded">
                            <p className="text-sm">{question}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Preparation Tips</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {interviewPrep.preparationTips?.map((tip: string, index: number) => (
                          <div key={index} className="flex items-start space-x-2">
                            <i className="fas fa-check text-green-600 mt-1"></i>
                            <p className="text-sm">{tip}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {interviewPrep.mockAnswerExamples && interviewPrep.mockAnswerExamples.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Sample Answers</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {interviewPrep.mockAnswerExamples.map((example: any, index: number) => (
                          <div key={index} className="border border-gray-200 rounded-lg p-4">
                            <h4 className="font-medium text-gray-900 mb-2">Q: {example.question}</h4>
                            <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded">
                              A: {example.answer}
                            </p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}