import {useState} from "react";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Progress} from "@/components/ui/progress";
import {useToast} from "@/hooks/use-toast";
import {apiRequest} from "@/lib/queryClient";
import {useAuth} from "@/context/AuthContext";
import jsPDF from 'jspdf';
import { Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';

export default function ResumeUpload() {
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { backendUser } = useAuth();

  const [parsedData, setParsedData] = useState<any>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewFields, setReviewFields] = useState<any>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!backendUser?.id) {
        throw new Error("Please log in before uploading a resume");
      }
      const formData = new FormData();
      formData.append("file", file);
      formData.append("userId", String(backendUser.id));
      const response = await apiRequest("POST", "/api/resumes/upload", formData);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: "Resume uploaded successfully. Review and confirm parsed data.",
      });
      const resume = data?.resume || data;
      const metadata = data?.metadata || resume?.metadata || {};
      setParsedData(data);
      setReviewFields({
        skills: resume?.skills || metadata?.skills || [],
        experience: resume?.experience || metadata?.experience || '',
        education: resume?.education || metadata?.education || '',
        summary: resume?.summary || metadata?.summary || '',
      });
      setReviewOpen(true);
      queryClient.invalidateQueries({ queryKey: ["/api/resumes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setUploadProgress(0);
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
      setUploadProgress(0);
    },
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!backendUser?.id) {
      toast({
        title: "Login required",
        description: "Please log in before uploading a resume.",
        variant: "destructive",
      });
      return;
    }
    setSelectedFile(file);

    const allowedTypes = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid File Type",
        description: "Please upload a PDF, DOC, or DOCX file.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please upload a file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }

    setUploadProgress(10);
    setTimeout(() => setUploadProgress(50), 500);
    setTimeout(() => setUploadProgress(80), 1000);

    uploadMutation.mutate(file);
  };

  const handleReviewFieldChange = (field: string, value: any) => {
    setReviewFields((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleConfirmParsedData = async () => {
    if (!backendUser?.id) return;
    try {
      await apiRequest("PUT", `/api/resumes/parsed?userId=${backendUser.id}`, reviewFields);
      setReviewOpen(false);
      toast({ title: "Resume Data Saved", description: "Your reviewed resume data has been saved." });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to save resume data." });
    }
  };

  const downloadInsights = () => {
    const insights = parsedData?.insights || parsedData?.resume?.insights;
    if (!insights) return;
    const blob = new Blob([JSON.stringify(insights, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resume-insights-${(selectedFile?.name || 'resume').replace(/\.[^/.]+$/, '')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.text("Resume Summary", 10, 10);
    doc.text(JSON.stringify(reviewFields, null, 2).slice(0, 1800), 10, 20);
    doc.save("resume-summary.pdf");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Resume</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={handleFileUpload}
          disabled={uploadMutation.isPending}
        />
        {uploadProgress > 0 && uploadProgress < 100 && (
          <Progress value={uploadProgress} />
        )}
        {uploadMutation.isPending && <p className="text-sm text-gray-500">Uploading and parsing...</p>}

        <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>Review Parsed Resume Data</DialogTitle>
          <DialogContent>
            <div className="space-y-3 mt-2">
              <label className="block text-sm font-medium">Skills (comma-separated)</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={Array.isArray(reviewFields.skills) ? reviewFields.skills.join(", ") : reviewFields.skills || ""}
                onChange={(e) =>
                  handleReviewFieldChange(
                    "skills",
                    e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  )
                }
              />
              <label className="block text-sm font-medium">Summary</label>
              <textarea
                className="w-full border rounded px-3 py-2"
                rows={4}
                value={reviewFields.summary || ""}
                onChange={(e) => handleReviewFieldChange("summary", e.target.value)}
              />
            </div>
          </DialogContent>
          <DialogActions>
            <Button variant="outline" onClick={downloadInsights}>Download Insights</Button>
            <Button variant="outline" onClick={exportPdf}>Export PDF</Button>
            <Button onClick={handleConfirmParsedData}>Confirm & Save</Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
}
