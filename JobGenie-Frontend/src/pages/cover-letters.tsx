import {useQuery} from "@tanstack/react-query";
import {useState} from "react";
import Navigation from "@/components/navigation";
import CoverLetterGenerator from "@/components/cover-letter-generator";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {resumeAPI} from "@/lib/api";
import { useAuth } from "../context/AuthContext";
import { LoadingCard } from '@/components/ui/loading-spinner';

export default function CoverLetters() {
  const { backendUser, loading } = useAuth();

  const { data: coverLetters = [] } = useQuery({
    queryKey: ["cover-letters", backendUser?.id],
    queryFn: async () => {
      if (!backendUser?.id) return [];
      // This would typically fetch from a cover letter service
      // For now, we'll return an empty array until the service is implemented
      return [];
    },
    enabled: !!backendUser?.id,
  });

  const { data: resumes = [], isLoading } = useQuery({
    queryKey: ["resumes", backendUser?.id],
    queryFn: async () => {
      if (!backendUser?.id) return [];
      const response = await resumeAPI.getUserResumes(backendUser.id);
      return response || [];
    },
    enabled: !!backendUser?.id,
  });

  if (loading) return <LoadingCard text="Loading cover letters..." />;
  if (!backendUser) return <LoadingCard text="Please log in to access cover letter generator..." />;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Cover Letter Generator
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Generate personalized cover letters for your job applications
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Generator */}
          <div className="lg:col-span-2">
            <CoverLetterGenerator resumes={resumes} />
          </div>

          {/* Saved Cover Letters */}
          <div className="space-y-6">
            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
              <CardHeader>
                <CardTitle>Saved Cover Letters</CardTitle>
              </CardHeader>
              <CardContent>
                {coverLetters.length === 0 ? (
                  <p className="text-gray-600 dark:text-gray-400 text-center py-4">
                    No cover letters saved yet
                  </p>
                ) : (
                  <div className="space-y-3">
                    {coverLetters.map((letter: any) => (
                      <div
                        key={letter.id}
                        className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                      >
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {letter.jobTitle}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {letter.company}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500">
                          {new Date(letter.createdAt).toLocaleDateString()}
                        </p>
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
