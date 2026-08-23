import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";

interface ResumeMetadataProps {
  resume: {
    fullName?: string;
    email?: string;
    phone?: string;
    location?: string;
    experience?: string;
    currentRole?: string;
    industry?: string;
    skills?: string[];
    uploadedAt?: string;
    isProcessed?: boolean;
    processingError?: string;
  };
}

export default function ResumeMetadata({ resume }: ResumeMetadataProps) {
  if (!resume.isProcessed && !resume.processingError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <i className="fas fa-user-circle mr-2 text-primary-600"></i>
            Processing Resume...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-3">
            <i className="fas fa-spinner fa-spin text-primary-600"></i>
            <p className="text-gray-600">AI is extracting information from your resume...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (resume.processingError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <i className="fas fa-exclamation-triangle mr-2 text-red-600"></i>
            Processing Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-600">{resume.processingError}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <i className="fas fa-user-circle mr-2 text-primary-600"></i>
          Extracted Profile Information
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <p className="text-gray-900 font-medium">{resume.fullName || "Not extracted"}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <p className="text-gray-900">{resume.email || "Not extracted"}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <p className="text-gray-900">{resume.phone || "Not extracted"}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <p className="text-gray-900">{resume.location || "Not extracted"}</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Years of Experience</label>
              <p className="text-gray-900 font-medium">{resume.experience || "Not extracted"}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Role</label>
              <p className="text-gray-900">{resume.currentRole || "Not extracted"}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
              <p className="text-gray-900">{resume.industry || "Not extracted"}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Updated</label>
              <p className="text-gray-600 text-sm">
                {resume.uploadedAt ? new Date(resume.uploadedAt).toLocaleDateString() : "Unknown"}
              </p>
            </div>
          </div>
        </div>
        
        {resume.skills && resume.skills.length > 0 && (
          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Key Skills</label>
            <div className="flex flex-wrap gap-2">
              {resume.skills.map((skill, index) => (
                <Badge key={index} variant="secondary" className="bg-primary-100 text-primary-800">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
