import {useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {ScrollArea} from "@/components/ui/scroll-area";
import {useToast} from "@/hooks/use-toast";
import {apiRequest} from "@/lib/queryClient";
import jsPDF from 'jspdf';

interface ResumeChatProps {
  resumeId: number;
  resumeName: string;
}

interface ChatMessage {
  id: number;
  question: string;
  answer: string;
  timestamp: Date;
}

export default function ResumeChat({ resumeId, resumeName }: ResumeChatProps) {
  const [question, setQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const { toast } = useToast();

  // Note: there is no backend persistence for chat history (no /api/chat/history endpoint
  // exists — it previously 404'd here, silently discarding every AI answer). Conversation
  // state lives in this component for the current session only.

  const askMutation = useMutation({
    mutationFn: async (data: { resumeId: number; question: string }) => {
      // ResumeController#chatWithAI reads "message" and "context" from the request body —
      // this previously sent "question"/"user_context", so the message was always null and
      // the AI service (which requires a non-null question) rejected every call with a 500.
      const response = await apiRequest("POST", "/api/resumes/chat", {
        message: data.question,
        context: { resumeId: data.resumeId },
      });
      const result = await response.json();
      return { question: data.question, answer: result?.response || result?.answer || "No response received." };
    },
    onSuccess: ({ question: askedQuestion, answer }) => {
      setChatHistory((prev) => [
        ...prev,
        { id: Date.now(), question: askedQuestion, answer, timestamp: new Date() },
      ]);
      setQuestion("");
      toast({
        title: "Question Answered",
        description: "Your AI assistant has responded to your question.",
      });
    },
    onError: (error) => {
      toast({
        title: "Chat Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAskQuestion = () => {
    if (!question.trim()) {
      toast({
        title: "Empty Question",
        description: "Please enter a question about your resume.",
        variant: "destructive",
      });
      return;
    }

    askMutation.mutate({ resumeId, question: question.trim() });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAskQuestion();
    }
  };

  const suggestedQuestions = [
    "What are my strongest skills based on my resume?",
    "How can I improve my resume for tech roles?",
    "What types of jobs would be a good fit for me?",
    "How does my experience level compare to industry standards?",
    "What keywords should I include for better job matching?"
  ];

  const exportToPDF = () => {
    if (chatHistory.length === 0) return;
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const maxWidth = pageWidth - 2 * margin;
    
    // Add title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Resume Chat Conversation', pageWidth / 2, 30, { align: 'center' });
    
    // Add resume info
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Resume: ${resumeName}`, margin, 50);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, 60);
    
    // Add messages
    doc.setFontSize(11);
    let yPosition = 80;
    
    chatHistory.forEach((msg: ChatMessage) => {
      if (yPosition > 250) {
        doc.addPage();
        yPosition = 30;
      }

      doc.setFont('helvetica', 'bold');
      doc.text('You:', margin, yPosition);
      yPosition += 8;
      doc.setFont('helvetica', 'normal');
      let lines = doc.splitTextToSize(msg.question, maxWidth);
      doc.text(lines, margin, yPosition);
      yPosition += lines.length * 5 + 8;

      if (yPosition > 250) {
        doc.addPage();
        yPosition = 30;
      }

      doc.setFont('helvetica', 'bold');
      doc.text('AI:', margin, yPosition);
      yPosition += 8;
      doc.setFont('helvetica', 'normal');
      lines = doc.splitTextToSize(msg.answer, maxWidth);
      doc.text(lines, margin, yPosition);
      yPosition += lines.length * 5 + 12;
    });
    
    // Save PDF
    doc.save(`resume-chat-${resumeName.replace(/\.[^/.]+$/, '') || 'conversation'}.pdf`);
    
    toast({
      title: "PDF Exported",
      description: "Chat conversation has been exported as PDF.",
    });
  };

  const exportToJSON = () => {
    if (chatHistory.length === 0) return;
    
    const data = {
      resume: resumeName,
      messages: chatHistory,
      generatedAt: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resume-chat-${resumeName.replace(/\.[^/.]+$/, '') || 'conversation'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "JSON Exported",
      description: "Chat conversation data has been exported as JSON.",
    });
  };

  return (
    <Card className="h-[500px] flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center">
            <i className="fas fa-comments mr-2 text-primary-600"></i>
            Chat with Your Resume: {resumeName}
          </span>
          {chatHistory.length > 0 && (
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
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col space-y-4">
        <ScrollArea className="flex-1 border rounded-lg p-4">
          {chatHistory.length === 0 ? (
            <div className="text-center py-8">
              <i className="fas fa-robot text-4xl text-gray-300 mb-4"></i>
              <p className="text-gray-500 mb-4">Start a conversation about your resume!</p>
              <div className="space-y-2">
                <p className="text-sm text-gray-400 mb-2">Try asking:</p>
                {suggestedQuestions.slice(0, 2).map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => setQuestion(suggestion)}
                    className="block w-full text-left text-sm text-primary-600 hover:text-primary-700 hover:bg-primary-50 p-2 rounded transition-colors"
                  >
                    "{suggestion}"
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {chatHistory.map((chat: any) => (
                <div key={chat.id} className="space-y-3">
                  <div className="flex items-start space-x-3">
                    <div className="bg-primary-100 rounded-full p-2 flex-shrink-0">
                      <i className="fas fa-user text-primary-600 text-sm"></i>
                    </div>
                    <div className="bg-gray-100 rounded-lg p-3 flex-1">
                      <p className="text-gray-800">{chat.question}</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="bg-green-100 rounded-full p-2 flex-shrink-0">
                      <i className="fas fa-robot text-green-600 text-sm"></i>
                    </div>
                    <div className="bg-white border rounded-lg p-3 flex-1">
                      <p className="text-gray-800 whitespace-pre-wrap">{chat.answer}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="flex space-x-2">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask a question about your resume..."
            disabled={askMutation.isPending}
            className="flex-1"
          />
          <Button 
            onClick={handleAskQuestion}
            disabled={askMutation.isPending || !question.trim()}
            className="bg-primary-600 hover:bg-primary-700"
          >
            {askMutation.isPending ? (
              <i className="fas fa-spinner fa-spin"></i>
            ) : (
              <i className="fas fa-paper-plane"></i>
            )}
          </Button>
        </div>

        {chatHistory.length === 0 && (
          <div className="text-xs text-gray-400 text-center">
            Press Enter to send • AI assistant will analyze your resume content
          </div>
        )}
      </CardContent>
    </Card>
  );
}