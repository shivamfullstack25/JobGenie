import {useQuery} from "@tanstack/react-query";
import {useState} from "react";
import Navigation from "@/components/navigation";
import ResumeChat from "@/components/resume-chat";
import AutomationScheduler from "@/components/automation-scheduler";
import MarketIntelligence from "@/components/market-intelligence";
import ATSResumeGenerator from "@/components/ats-resume-generator";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {resumeAPI} from "@/lib/api";
import { useAuth } from "../context/AuthContext";
import { LoadingCard } from '@/components/ui/loading-spinner';

export default function ResumeAssistant() {
  const { backendUser, loading } = useAuth();

  const { data: resumes = [], isLoading } = useQuery({
    queryKey: ["resumes", backendUser?.id],
    queryFn: async () => {
      if (!backendUser?.id) return [];
      const response = await resumeAPI.getUserResumes(backendUser.id);
      return response || [];
    },
    enabled: !!backendUser?.id,
  });

  const processedResumes = resumes.filter((resume: any) => resume.isProcessed);

  if (loading) return <LoadingCard text="Loading resume assistant..." />;
  if (!backendUser) return <LoadingCard text="Please log in to access resume assistant..." />;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Resume Assistant
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            AI-powered resume optimization and job matching
          </p>
        </div>

        {processedResumes.length === 0 ? (
          <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
            <CardHeader>
              <CardTitle>No Processed Resumes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Upload and process a resume first to use the AI assistant features.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="chat" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="chat" className="flex items-center space-x-2">
                <i className="fas fa-comments"></i>
                <span>Resume Chat</span>
              </TabsTrigger>
              <TabsTrigger value="generator" className="flex items-center space-x-2">
                <i className="fas fa-magic"></i>
                <span>ATS Generator</span>
              </TabsTrigger>
              <TabsTrigger value="automation" className="flex items-center space-x-2">
                <i className="fas fa-robot"></i>
                <span>Job Automation</span>
              </TabsTrigger>
              <TabsTrigger value="intelligence" className="flex items-center space-x-2">
                <i className="fas fa-chart-line"></i>
                <span>Market Intelligence</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chat" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {processedResumes.map((resume: any) => (
                  <ResumeChat
                    key={resume.id}
                    resumeId={resume.id}
                    resumeName={resume.fileName}
                  />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="generator">
              <ATSResumeGenerator resumes={processedResumes} />
            </TabsContent>

            <TabsContent value="automation">
              <AutomationScheduler resumes={processedResumes} />
            </TabsContent>

            <TabsContent value="intelligence">
              <MarketIntelligence />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}