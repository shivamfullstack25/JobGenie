import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";

interface JobMatchCardProps {
  job: {
    id?: string;
    jobId?: string;
    title: string;
    company: string;
    location: string;
    salary?: string;
    description?: string;
    platform?: string;
    url?: string;
    matchScore?: number;
    matchPercentage?: number;
    postedAt?: string;
    remote?: boolean;
    matchingSkills?: string[];
    missingSkills?: string[];
    recommendation?: string;
  };
  onApply?: () => void;
  onSave?: () => void;
  saving?: boolean;
  applying?: boolean;
}

export default function JobMatchCard({ job, onApply, onSave, saving, applying }: JobMatchCardProps) {
  const getMatchColor = (score: number) => {
    if (score >= 90) return "bg-green-100 text-green-800";
    if (score >= 80) return "bg-blue-100 text-blue-800";
    return "bg-yellow-100 text-yellow-800";
  };

  const matchScore = job.matchScore || job.matchPercentage || 0;
  const jobId = job.id || job.jobId;

  return (
    <div className="p-6 hover:bg-gray-50 transition-colors duration-150">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <h4 className="text-lg font-semibold text-gray-900">{job.title}</h4>
            <Badge className={getMatchColor(matchScore)}>
              {matchScore}% Match
            </Badge>
          </div>
          <p className="text-gray-600 font-medium mb-1">{job.company}</p>
          <p className="text-gray-500 text-sm mb-3">
            {job.location} {job.remote && "• Remote Friendly"}
          </p>
          {job.description && (
            <p className="text-gray-700 text-sm line-clamp-2 mb-3">
              {job.description}
            </p>
          )}
          
          {job.matchingSkills && job.matchingSkills.length > 0 && (
            <div className="mb-3">
              <p className="text-sm text-gray-600 mb-1">Matching Skills:</p>
              <div className="flex flex-wrap gap-1">
                {job.matchingSkills.map((skill, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {job.recommendation && (
            <p className="text-sm text-blue-600 mb-3">
              <i className="fas fa-lightbulb mr-1"></i>
              {job.recommendation}
            </p>
          )}
          
          <div className="flex items-center space-x-4">
            {job.salary && (
              <span className="text-sm text-gray-600">
                <i className="fas fa-dollar-sign mr-1"></i>
                {job.salary}
              </span>
            )}
            {job.postedAt && (
              <span className="text-sm text-gray-600">
                <i className="fas fa-clock mr-1"></i>
                Posted {job.postedAt}
              </span>
            )}
            {job.platform && (
              <span className="text-sm text-gray-600">
                <i className="fas fa-map-marker-alt mr-1"></i>
                {job.platform}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col space-y-2 ml-6">
          {onApply && (
            <Button
              className="bg-primary-600 hover:bg-primary-700"
              onClick={onApply}
              disabled={applying}
            >
              {applying ? "Applying..." : "Auto Apply"}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={onSave}
            disabled={!onSave || saving}
          >
            {saving ? "Saving..." : "Save Job"}
          </Button>
        </div>
      </div>
    </div>
  );
}
