import {useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Progress} from "@/components/ui/progress";
import {Badge} from "@/components/ui/badge";
import {useToast} from "@/hooks/use-toast";
import {apiRequest} from "@/lib/queryClient";
import jsPDF from 'jspdf';

interface ATSResumeGeneratorProps {
  resumes: Array<{
    id: number;
    fileName: string;
    isProcessed: boolean;
  }>;
}

export default function ATSResumeGenerator({ resumes }: ATSResumeGeneratorProps) {
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");
  const [targetJobTitle, setTargetJobTitle] = useState("");
  const [targetCompany, setTargetCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [resumeStyle, setResumeStyle] = useState("modern");
  const [optimizeFor, setOptimizeFor] = useState("ats");
  const [generatedResume, setGeneratedResume] = useState<any>(null);

  const { toast } = useToast();

  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      // Get resume content first
      const resumeResponse = await apiRequest("GET", `/api/resumes/${data.resumeId}/content`);
      const resumeContent = await resumeResponse.text();
      
      // Generate ATS-optimized resume using the backend endpoint
      const response = await apiRequest("POST", "/api/resumes/optimize-ats", {
        resumeContent: resumeContent,
        jobDescription: data.jobDescription || "",
        targetScore: 80,
      });
      return await response.json();
    },
    onSuccess: (data) => {
      setGeneratedResume(data);
      toast({
        title: "Resume Generated",
        description: "Your ATS-optimized resume has been created successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const keywordMutation = useMutation({
    mutationFn: async (data: any) => {
      // No dedicated keyword-analysis endpoint exists; reuse optimize-ats, which already
      // computes matched/missing keywords, instead of calling a nonexistent route.
      const resumeResponse = await apiRequest("GET", `/api/resumes/${data.resumeId}/content`);
      const resumeContent = await resumeResponse.text();
      const response = await apiRequest("POST", "/api/resumes/optimize-ats", {
        resumeContent,
        jobDescription: data.jobDescription || "",
        targetScore: 80,
      });
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Keyword Analysis Complete",
        description: `Keyword match: ${data.atsScore ?? data.estimated_score ?? "N/A"}%`,
      });
    },
    onError: (error) => {
      toast({
        title: "Analysis Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    if (!selectedResumeId || !targetJobTitle) {
      toast({
        title: "Missing Information",
        description: "Please select a resume and enter a target job title.",
        variant: "destructive",
      });
      return;
    }

    generateMutation.mutate({
      resumeId: parseInt(selectedResumeId),
      targetJobTitle,
      targetCompany: targetCompany || undefined,
      jobDescription: jobDescription || undefined,
      resumeStyle,
      optimizeFor,
    });
  };

  const handleKeywordAnalysis = () => {
    if (!selectedResumeId) {
      toast({
        title: "Missing Information",
        description: "Please select a resume to analyze.",
        variant: "destructive",
      });
      return;
    }

    keywordMutation.mutate({
      resumeId: parseInt(selectedResumeId),
      jobDescription: jobDescription || undefined,
    });
  };

  const copyToClipboard = () => {
    if (generatedResume?.content) {
      navigator.clipboard.writeText(generatedResume.content);
      toast({
        title: "Copied",
        description: "Resume content copied to clipboard.",
      });
    }
  };

  const downloadResume = () => {
    if (generatedResume?.content) {
      const blob = new Blob([generatedResume.content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ats-optimized-resume-${targetJobTitle.replace(/\s+/g, '-').toLowerCase()}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const exportToPDF = () => {
    if (!generatedResume?.content) return;
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const maxWidth = pageWidth - 2 * margin;
    
    // Add title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('ATS-Optimized Resume', pageWidth / 2, 30, { align: 'center' });
    
    // Add job details
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Target Job: ${targetJobTitle}`, margin, 50);
    if (targetCompany) {
      doc.text(`Target Company: ${targetCompany}`, margin, 60);
    }
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, 70);
    
    // Add content
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(generatedResume.content, maxWidth);
    doc.text(lines, margin, 90);
    
    // Save PDF
    doc.save(`ats-resume-${targetJobTitle.toLowerCase().replace(/\s+/g, '-')}.pdf`);
    
    toast({
      title: "PDF Exported",
      description: "ATS resume has been exported as PDF.",
    });
  };

  const exportToJSON = () => {
    if (!generatedResume) return;
    
    const data = {
      targetJobTitle,
      targetCompany,
      resume: generatedResume,
      generatedAt: new Date().toISOString(),
      resumeStyle,
      optimizeFor,
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ats-resume-${targetJobTitle.toLowerCase().replace(/\s+/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "JSON Exported",
      description: "ATS resume data has been exported as JSON.",
    });
  };

  const processedResumes = resumes.filter(resume => resume.isProcessed);

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-green-600";
    if (score >= 75) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-2xl font-bold text-gray-900 mb-2">ATS Resume Generator</h3>
        <p className="text-gray-600">
          Create industry-standard, ATS-optimized resumes tailored for specific job applications
        </p>
      </div>

      {processedResumes.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <i className="fas fa-exclamation-circle mr-2 text-yellow-500"></i>
              No Processed Resumes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">
              Upload and process a resume first to generate ATS-optimized versions.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Generation Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <i className="fas fa-magic mr-2 text-purple-600"></i>
                Generate ATS-Optimized Resume
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="resume-select">Select Resume</Label>
                <Select value={selectedResumeId} onValueChange={setSelectedResumeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a resume to optimize" />
                  </SelectTrigger>
                  <SelectContent>
                    {processedResumes.map((resume) => (
                      <SelectItem key={resume.id} value={resume.id.toString()}>
                        {resume.fileName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="job-title">Target Job Title *</Label>
                  <Input
                    id="job-title"
                    value={targetJobTitle}
                    onChange={(e) => setTargetJobTitle(e.target.value)}
                    placeholder="e.g., Senior Software Engineer"
                  />
                </div>
                <div>
                  <Label htmlFor="company">Target Company (Optional)</Label>
                  <Input
                    id="company"
                    value={targetCompany}
                    onChange={(e) => setTargetCompany(e.target.value)}
                    placeholder="e.g., Google, Microsoft"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="job-description">Job Description (Optional but Recommended)</Label>
                <Textarea
                  id="job-description"
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste the job description here for better optimization..."
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="style">Resume Style</Label>
                  <Select value={resumeStyle} onValueChange={setResumeStyle}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="modern">Modern</SelectItem>
                      <SelectItem value="classic">Classic</SelectItem>
                      <SelectItem value="minimal">Minimal</SelectItem>
                      <SelectItem value="creative">Creative</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="optimize">Optimize For</Label>
                  <Select value={optimizeFor} onValueChange={setOptimizeFor}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ats">ATS Systems</SelectItem>
                      <SelectItem value="human">Human Reviewers</SelectItem>
                      <SelectItem value="hybrid">Hybrid (Balanced)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex space-x-3">
                <Button 
                  onClick={handleGenerate}
                  disabled={generateMutation.isPending || !selectedResumeId || !targetJobTitle}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <i className="fas fa-magic mr-2"></i>
                  {generateMutation.isPending ? "Generating..." : "Generate ATS Resume"}
                </Button>
                <Button 
                  variant="outline"
                  onClick={handleKeywordAnalysis}
                  disabled={keywordMutation.isPending || !selectedResumeId}
                >
                  <i className="fas fa-search mr-2"></i>
                  Analyze Keywords
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Generated Resume Results */}
          {generatedResume && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Resume Content */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center">
                        <i className="fas fa-file-alt mr-2 text-green-600"></i>
                        Generated Resume
                      </span>
                      <div className="flex space-x-2">
                        <Button variant="outline" size="sm" onClick={copyToClipboard}>
                          <i className="fas fa-copy mr-1"></i>
                          Copy
                        </Button>
                        <Button variant="outline" size="sm" onClick={exportToPDF}>
                          <i className="fas fa-file-pdf mr-1"></i>
                          PDF
                        </Button>
                        <Button variant="outline" size="sm" onClick={exportToJSON}>
                          <i className="fas fa-file-code mr-1"></i>
                          JSON
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-y-auto">
                      <pre className="whitespace-pre-wrap text-sm font-mono">
                        {generatedResume.content}
                      </pre>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Analysis & Optimization */}
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <i className="fas fa-chart-bar mr-2 text-blue-600"></i>
                      ATS Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-center">
                      <div className={`text-3xl font-bold ${getScoreColor(generatedResume.atsScore)}`}>
                        {generatedResume.atsScore}%
                      </div>
                      <div className="text-sm text-gray-600">ATS Compatibility</div>
                      <Progress value={generatedResume.atsScore} className="mt-2" />
                    </div>

                    {generatedResume.improvements?.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2">Improvements Made</h4>
                        <ul className="space-y-1">
                          {generatedResume.improvements.map((improvement: string, index: number) => (
                            <li key={index} className="text-sm text-gray-700 flex items-start">
                              <i className="fas fa-check text-green-500 mr-2 mt-0.5 text-xs"></i>
                              {improvement}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {generatedResume.keywordDensity?.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <i className="fas fa-tags mr-2 text-orange-600"></i>
                        Keyword Analysis
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {generatedResume.keywordDensity.map((keyword: any, index: number) => (
                          <div key={index} className="flex items-center justify-between">
                            <span className="text-sm font-medium">{keyword.keyword}</span>
                            <div className="flex items-center space-x-2">
                              <Badge 
                                variant="secondary"
                                className={
                                  keyword.importance === 'high' ? 'bg-red-100 text-red-800' :
                                  keyword.importance === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }
                              >
                                {keyword.count}x
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}