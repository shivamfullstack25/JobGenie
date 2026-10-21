import React, { Component, ErrorInfo, ReactNode } from 'react';
import {AlertTriangle, RefreshCcw, Home, Bug} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string;
}

export class ErrorBoundary extends Component<Props, State> {
  private retryCount = 0;
  private maxRetries = 3;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    const errorId = `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return {
      hasError: true,
      error,
      errorId,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    // Log error to console
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Report error to external service (you can integrate with Sentry, LogRocket, etc.)
    this.reportError(error, errorInfo);

    // Call custom error handler
    this.props.onError?.(error, errorInfo);
  }

  private reportError = async (error: Error, errorInfo: ErrorInfo) => {
    try {
      const errorReport = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        errorId: this.state.errorId,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        userId: localStorage.getItem('userId') || 'anonymous',
      };

      // Send to your error reporting service
      await fetch('/api/analytics/errors/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(errorReport),
      });
    } catch (reportingError) {
      console.error('Failed to report error:', reportingError);
    }
  };

  private handleRetry = () => {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        errorId: '',
      });
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  private handleReportBug = () => {
    const errorDetails = encodeURIComponent(
      `Error ID: ${this.state.errorId}\n` +
      `Message: ${this.state.error?.message}\n` +
      `URL: ${window.location.href}\n` +
      `User Agent: ${navigator.userAgent}`
    );
    
    const subject = encodeURIComponent(`Bug Report - ${this.state.errorId}`);
    const mailto = `mailto:support@jobgenie.com?subject=${subject}&body=${errorDetails}`;
    
    window.open(mailto);
  };

  private getErrorSeverity = (): 'low' | 'medium' | 'high' | 'critical' => {
    const error = this.state.error;
    if (!error) return 'low';

    if (error.name === 'ChunkLoadError' || error.message.includes('Loading chunk')) {
      return 'medium';
    }

    if (error.message.includes('Network Error') || error.message.includes('fetch')) {
      return 'medium';
    }

    if (error.name === 'TypeError' || error.name === 'ReferenceError') {
      return 'high';
    }

    return 'critical';
  };

  private getSuggestion = (): string => {
    const error = this.state.error;
    if (!error) return 'Please try again.';

    if (error.name === 'ChunkLoadError' || error.message.includes('Loading chunk')) {
      return 'This appears to be a loading issue. Please refresh the page.';
    }

    if (error.message.includes('Network Error') || error.message.includes('fetch')) {
      return 'Please check your internet connection and try again.';
    }

    if (error.message.includes('Firebase') || error.message.includes('auth')) {
      return 'There seems to be an authentication issue. Please try logging in again.';
    }

    return 'An unexpected error occurred. Our team has been notified.';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const severity = this.getErrorSeverity();
      const suggestion = this.getSuggestion();
      const canRetry = this.retryCount < this.maxRetries;

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <Card className="max-w-2xl w-full">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4">
                <AlertTriangle className="h-16 w-16 text-red-500" />
              </div>
              <CardTitle className="text-2xl font-bold text-gray-900">
                Oops! Something went wrong
              </CardTitle>
              <div className="flex justify-center mt-2">
                <Badge 
                  variant={severity === 'critical' ? 'destructive' : severity === 'high' ? 'destructive' : 'secondary'}
                  className="text-xs"
                >
                  {severity.toUpperCase()} SEVERITY
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="text-center">
                <p className="text-gray-600 mb-2">{suggestion}</p>
                <p className="text-sm text-gray-500">
                  Error ID: <code className="bg-gray-100 px-2 py-1 rounded">{this.state.errorId}</code>
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                {canRetry && (
                  <Button 
                    onClick={this.handleRetry}
                    className="flex items-center space-x-2"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    <span>Try Again ({this.maxRetries - this.retryCount} left)</span>
                  </Button>
                )}

                <Button 
                  onClick={this.handleReload}
                  variant="outline"
                  className="flex items-center space-x-2"
                >
                  <RefreshCcw className="h-4 w-4" />
                  <span>Reload Page</span>
                </Button>

                <Button 
                  onClick={this.handleGoHome}
                  variant="outline"
                  className="flex items-center space-x-2"
                >
                  <Home className="h-4 w-4" />
                  <span>Go Home</span>
                </Button>
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-center">
                  <Button 
                    onClick={this.handleReportBug}
                    variant="ghost"
                    size="sm"
                    className="flex items-center space-x-2 text-gray-500 hover:text-gray-700"
                  >
                    <Bug className="h-4 w-4" />
                    <span>Report this issue</span>
                  </Button>
                </div>
              </div>

              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="mt-6 p-4 bg-gray-100 rounded-lg">
                  <summary className="cursor-pointer text-sm font-medium text-gray-700 mb-2">
                    Development Error Details
                  </summary>
                  <div className="text-xs font-mono text-gray-600 space-y-2">
                    <div>
                      <strong>Error:</strong> {this.state.error.message}
                    </div>
                    <div>
                      <strong>Stack:</strong>
                      <pre className="mt-1 whitespace-pre-wrap break-all">
                        {this.state.error.stack}
                      </pre>
                    </div>
                    {this.state.errorInfo && (
                      <div>
                        <strong>Component Stack:</strong>
                        <pre className="mt-1 whitespace-pre-wrap break-all">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook for handling async errors in functional components
export const useErrorHandler = () => {
  return (error: Error, errorInfo?: any) => {
    console.error('Async error caught:', error, errorInfo);
    
    // You can integrate with your error reporting service here
    const errorReport = {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      type: 'async_error',
    };

    fetch('/api/analytics/errors/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorReport),
    }).catch(console.error);
  };
};

// HOC for wrapping components with error boundary
export const withErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode
) => {
  return (props: P) => (
    <ErrorBoundary fallback={fallback}>
      <Component {...props} />
    </ErrorBoundary>
  );
}; 