import {useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";
import {useToast} from "@/hooks/use-toast";
import {apiRequest} from "@/lib/queryClient";

// Add jsPDF import for PDF export
import jsPDF from 'jspdf';

interface CoverLetterGeneratorProps {
  resumes: Array<{
    id: number;
    fileName: string;
    isProcessed: boolean;
  }>;
}

export default function CoverLetterGenerator({ resumes }: CoverLetterGeneratorProps) {
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [tone, setTone] = useState("professional");
  const [generatedContent, setGeneratedContent] = useState("");

  const { toast } = useToast();

  const generateMutation = useMutation({
    mutationFn: async (data: { resumeId: number; jobTitle: string; company: string; jobDescription: string; tone: string }) => {
      // Get resume content first
      const resumeResponse = await apiRequest("GET", `/api/resumes/${data.resumeId}/content`);
      const resumeContent = await resumeResponse.text();

      // Generate cover letter using the backend endpoint. Field names here must match what
      // ResumeController#generateCoverLetter reads (resumeContent/jobDescription/companyName/
      // position/tone) — this previously sent jobTitle/companyName/resumeContent/
      // personalStatement, so jobDescription and position were always null and the AI
      // service (which requires job_description) rejected every request with a 500.
      const response = await apiRequest("POST", "/api/resumes/generate-cover-letter", {
        resumeContent: resumeContent,
        jobDescription: data.jobDescription,
        companyName: data.company,
        position: data.jobTitle,
        tone: data.tone,
      });
      return await response.json();
    },
    onSuccess: (data) => {
      setGeneratedContent(data.cover_letter || data.content || "Cover letter generated successfully!");
      toast({
        title: "Success",
        description: "Cover letter generated successfully!",
      });
    },
    onError: (error) => {
      toast({
        title: "Generation Failed",
        description: (error instanceof Error ? error.message : String(error)),
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    if (!selectedResumeId || !jobTitle || !company) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields to generate a cover letter.",
        variant: "destructive",
      });
      return;
    }

    generateMutation.mutate({
      resumeId: parseInt(selectedResumeId),
      jobTitle,
      company,
      jobDescription,
      tone,
    });
  };

  const processedResumes = resumes.filter(resume => resume.isProcessed);

  const exportToPDF = () => {
    if (!generatedContent) return;
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const maxWidth = pageWidth - 2 * margin;
    
    // Add title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Cover Letter', pageWidth / 2, 30, { align: 'center' });
    
    // Add job details
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Job Title: ${jobTitle}`, margin, 50);
    doc.text(`Company: ${company}`, margin, 60);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, 70);
    
    // Add content
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(generatedContent, maxWidth);
    doc.text(lines, margin, 90);
    
    // Save PDF
    doc.save(`cover-letter-${company.toLowerCase().replace(/\s+/g, '-')}.pdf`);
    
    toast({
      title: "PDF Exported",
      description: "Cover letter has been exported as PDF.",
    });
  };

  const exportToJSON = () => {
    if (!generatedContent) return;
    
    const data = {
      jobTitle,
      company,
      coverLetter: generatedContent,
      generatedAt: new Date().toISOString(),
      tone,
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cover-letter-${company.toLowerCase().replace(/\s+/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "JSON Exported",
      description: "Cover letter data has been exported as JSON.",
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <i className="fas fa-file-signature mr-2 text-primary-600"></i>
          Cover Letter Generator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="resume-select">Select Resume</Label>
          <Select value={selectedResumeId} onValueChange={setSelectedResumeId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a resume" />
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

        <div>
          <Label htmlFor="job-title">Job Title</Label>
          <Input
            id="job-title"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="e.g., Senior Software Engineer"
          />
        </div>

        <div>
          <Label htmlFor="company">Company</Label>
          <Input
            id="company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="e.g., Google"
          />
        </div>

        <div>
          <Label htmlFor="job-description">Job Description (Optional but Recommended)</Label>
          <Textarea
            id="job-description"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the job description here so the cover letter can be tailored to it..."
            className="min-h-[100px]"
          />
        </div>

        <div>
          <Label>Tone</Label>
          <div className="flex space-x-2 mt-2">
            {["professional", "friendly", "confident"].map((toneOption) => (
              <Button
                key={toneOption}
                variant={tone === toneOption ? "default" : "outline"}
                size="sm"
                onClick={() => setTone(toneOption)}
                className={tone === toneOption ? "bg-primary-600 hover:bg-primary-700" : ""}
              >
                {toneOption.charAt(0).toUpperCase() + toneOption.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        <Button 
          onClick={handleGenerate}
          disabled={generateMutation.isPending || processedResumes.length === 0}
          className="w-full bg-primary-600 hover:bg-primary-700"
        >
          <i className="fas fa-magic mr-2"></i>
          {generateMutation.isPending ? "Generating..." : "Generate Cover Letter"}
        </Button>

        {processedResumes.length === 0 && (
          <p className="text-sm text-gray-500 text-center">
            Please upload and process a resume first.
          </p>
        )}

        {generatedContent && (
          <div className="mt-4">
            <Label>Generated Cover Letter</Label>
            <Textarea
              value={generatedContent}
              onChange={(e) => setGeneratedContent(e.target.value)}
              className="mt-2 min-h-[200px]"
              placeholder="Your generated cover letter will appear here..."
            />
            <div className="flex space-x-2 mt-2">
              <Button variant="outline" size="sm" onClick={exportToPDF}>
                <i className="fas fa-download mr-1"></i>
                Download PDF
              </Button>
              <Button variant="outline" size="sm" onClick={exportToJSON}>
                <i className="fas fa-download mr-1"></i>
                Download JSON
              </Button>
            </div>
          </div>
        )}
        
        {!generatedContent && !generateMutation.isPending && (
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
            <p className="italic">
              Your AI-generated cover letter will appear here once generated. 
              It will be tailored to the specific job and your resume content.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
