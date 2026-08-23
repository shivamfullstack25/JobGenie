import React from 'react';
import {Loader2} from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'md', 
  text = 'Loading...', 
  className = '' 
}) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8'
  };

  return (
    <div 
      className={`flex items-center justify-center gap-2 ${className}`}
      role="status"
      aria-label={text}
    >
      <Loader2 className={`animate-spin ${sizeClasses[size]}`} />
      <span className="sr-only">{text}</span>
    </div>
  );
};

export const LoadingCard: React.FC<{ text?: string }> = ({ text = 'Loading...' }) => {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="text-center">
        <LoadingSpinner size="lg" text={text} />
        <p className="mt-2 text-sm text-gray-500">{text}</p>
      </div>
    </div>
  );
}; 