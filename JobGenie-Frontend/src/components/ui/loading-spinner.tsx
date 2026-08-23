import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2, Briefcase, Brain, FileText, Search, Zap } from 'lucide-react';

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  type?: 'default' | 'job-search' | 'ai-analysis' | 'file-upload' | 'automation' | 'pulse';
  text?: string;
  className?: string;
  showIcon?: boolean;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12'
};

const textSizeClasses = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl'
};

export const LoadingSpinner = ({ 
  size = 'md', 
  type = 'default', 
  text,
  className,
  showIcon = true
}: LoadingSpinnerProps) => {
  const renderIcon = () => {
    const iconClass = cn(sizeClasses[size], "animate-spin");
    
    switch (type) {
      case 'job-search':
        return <Search className={cn(iconClass, "text-blue-600")} />;
      case 'ai-analysis':
        return <Brain className={cn(iconClass, "text-purple-600")} />;
      case 'file-upload':
        return <FileText className={cn(iconClass, "text-green-600")} />;
      case 'automation':
        return <Zap className={cn(iconClass, "text-orange-600")} />;
      case 'pulse':
        return (
          <div className={cn(
            "rounded-full bg-gradient-to-r from-blue-400 to-purple-600 animate-pulse",
            sizeClasses[size]
          )} />
        );
      default:
        return <Loader2 className={cn(iconClass, "text-gray-600")} />;
    }
  };

  const getDefaultText = () => {
    switch (type) {
      case 'job-search':
        return 'Searching for jobs...';
      case 'ai-analysis':
        return 'AI is analyzing...';
      case 'file-upload':
        return 'Uploading file...';
      case 'automation':
        return 'Running automation...';
      default:
        return 'Loading...';
    }
  };

  return (
    <div className={cn("flex flex-col items-center justify-center space-y-2", className)}>
      {showIcon && renderIcon()}
      {(text || type !== 'default') && (
        <p className={cn(
          "text-gray-600 font-medium",
          textSizeClasses[size]
        )}>
          {text || getDefaultText()}
        </p>
      )}
    </div>
  );
};

export const LoadingCard = ({ 
  text, 
  type = 'default', 
  className 
}: { 
  text?: string; 
  type?: LoadingSpinnerProps['type']; 
  className?: string; 
}) => (
  <div className={cn(
    "flex items-center justify-center min-h-[200px] bg-gray-50 rounded-lg border-2 border-dashed border-gray-200",
    className
  )}>
    <LoadingSpinner size="lg" type={type} text={text} />
  </div>
);

export const LoadingOverlay = ({ 
  isVisible, 
  text, 
  type = 'default' 
}: { 
  isVisible: boolean; 
  text?: string; 
  type?: LoadingSpinnerProps['type']; 
}) => {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 shadow-xl">
        <LoadingSpinner size="xl" type={type} text={text} />
      </div>
    </div>
  );
};

export const InlineLoader = ({ 
  text, 
  className 
}: { 
  text?: string; 
  className?: string; 
}) => (
  <div className={cn("flex items-center space-x-2", className)}>
    <LoadingSpinner size="sm" showIcon={true} />
    {text && <span className="text-sm text-gray-600">{text}</span>}
  </div>
);

// Skeleton loading components
export const SkeletonCard = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse", className)}>
    <div className="bg-gray-200 rounded-lg h-48 w-full mb-4"></div>
    <div className="space-y-2">
      <div className="bg-gray-200 h-4 rounded w-3/4"></div>
      <div className="bg-gray-200 h-4 rounded w-1/2"></div>
      <div className="bg-gray-200 h-4 rounded w-5/6"></div>
    </div>
  </div>
);

export const SkeletonText = ({ 
  lines = 3, 
  className 
}: { 
  lines?: number; 
  className?: string; 
}) => (
  <div className={cn("animate-pulse space-y-2", className)}>
    {Array.from({ length: lines }).map((_, i) => (
      <div 
        key={i}
        className={cn(
          "bg-gray-200 h-4 rounded",
          i === lines - 1 ? "w-3/4" : "w-full"
        )}
      />
    ))}
  </div>
);

export const SkeletonTable = ({ 
  rows = 5, 
  columns = 4 
}: { 
  rows?: number; 
  columns?: number; 
}) => (
  <div className="animate-pulse">
    <div className="grid grid-cols-4 gap-4 mb-4">
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="bg-gray-300 h-6 rounded"></div>
      ))}
    </div>
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <div key={rowIndex} className="grid grid-cols-4 gap-4 mb-2">
        {Array.from({ length: columns }).map((_, colIndex) => (
          <div key={colIndex} className="bg-gray-200 h-4 rounded"></div>
        ))}
      </div>
    ))}
  </div>
); 