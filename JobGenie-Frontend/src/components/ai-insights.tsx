import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Progress} from "@/components/ui/progress";
import {useToast} from "@/hooks/use-toast";
import {apiRequest} from "@/lib/queryClient";
import jsPDF from 'jspdf';

interface AiInsightsProps {
  resume: {
    summary?: string;
    strengths?: string[];
    improvements?: string[];
    matchScore?: number;
    atsScore?: number;
    atsRecommendations?: string[];
    industryFit?: string;
    salaryEstimate?: {
      min: number;
      max: number;
      currency: string;
    };
  };
}

export default function AiInsights({ resume }: AiInsightsProps) {
  const { toast } = useToast();

  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const maxWidth = pageWidth - 2 * margin;
    
    // Add title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('AI Career Insights Report', pageWidth / 2, 30, { align: 'center' });
    
    // Add resume info
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, 50);
    
    // Add insights
    doc.setFontSize(11);
    let yPosition = 70;
    
    if (resume.strengths && resume.strengths.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.text('Strengths:', margin, yPosition);
      yPosition += 10;
      doc.setFont('helvetica', 'normal');
      const strengthsText = resume.strengths.join(', ');
      const strengthsLines = doc.splitTextToSize(strengthsText, maxWidth);
      doc.text(strengthsLines, margin, yPosition);
      yPosition += strengthsLines.length * 5 + 15;
    }
    
    if (resume.improvements && resume.improvements.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.text('Improvements:', margin, yPosition);
      yPosition += 10;
      doc.setFont('helvetica', 'normal');
      const improvementsText = resume.improvements.join(', ');
      const improvementsLines = doc.splitTextToSize(improvementsText, maxWidth);
      doc.text(improvementsLines, margin, yPosition);
      yPosition += improvementsLines.length * 5 + 15;
    }
    
    if (resume.summary) {
      doc.setFont('helvetica', 'bold');
      doc.text('Summary:', margin, yPosition);
      yPosition += 10;
      doc.setFont('helvetica', 'normal');
      const summaryLines = doc.splitTextToSize(resume.summary, maxWidth);
      doc.text(summaryLines, margin, yPosition);
    }
    
    // Save PDF
    doc.save(`ai-insights-report.pdf`);
    
    toast({
      title: "PDF Exported",
      description: "AI insights have been exported as PDF.",
    });
  };

  const exportToJSON = () => {
    const data = {
      resume,
      generatedAt: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-insights-report.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "JSON Exported",
      description: "AI insights data has been exported as JSON.",
    });
  };

  if (!resume.summary && (!resume.strengths || resume.strengths.length === 0)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <i className="fas fa-lightbulb mr-2 text-yellow-500"></i>
            AI Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-center py-4">
            Insights will be available once your resume is processed.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center">
            <i className="fas fa-lightbulb mr-2 text-yellow-500"></i>
            AI Insights
          </span>
          <div className="flex space-x-2">
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
      <CardContent className="space-y-4">
        {resume.strengths && resume.strengths.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="font-semibold text-green-800 mb-2">
              <i className="fas fa-check-circle mr-1"></i>
              Strengths
            </h4>
            <ul className="text-sm text-green-700 space-y-1">
              {resume.strengths.map((strength, index) => (
                <li key={index}>• {strength}</li>
              ))}
            </ul>
          </div>
        )}
        
        {resume.improvements && resume.improvements.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-800 mb-2">
              <i className="fas fa-arrow-up mr-1"></i>
              Improvements
            </h4>
            <ul className="text-sm text-blue-700 space-y-1">
              {resume.improvements.map((improvement, index) => (
                <li key={index}>• {improvement}</li>
              ))}
            </ul>
          </div>
        )}
        
        {resume.matchScore && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h4 className="font-semibold text-purple-800 mb-2">
              <i className="fas fa-star mr-1"></i>
              Match Score
            </h4>
            <div className="flex items-center space-x-3 mb-2">
              <Progress value={resume.matchScore} className="flex-1" />
              <span className="text-sm font-semibold text-purple-800">{resume.matchScore}%</span>
            </div>
            <p className="text-sm text-purple-700">
              Your profile aligns well with current market demands.
            </p>
          </div>
        )}

        {resume.summary && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-800 mb-2">
              <i className="fas fa-user mr-1"></i>
              Professional Summary
            </h4>
            <p className="text-sm text-gray-700">{resume.summary}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
