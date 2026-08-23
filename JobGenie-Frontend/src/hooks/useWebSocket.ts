import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/lib/queryClient';

export interface WebSocketMessage {
  type: 'job_match' | 'application_update' | 'notification' | 'system_update' | 'ai_analysis_complete' | 
        'real_time_match' | 'automation_progress' | 'market_update' | 'skill_recommendation' | 'live_analytics';
  data: any;
  timestamp: string;
  id?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

export interface UseWebSocketOptions {
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectInterval?: number;
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

export const useWebSocket = (options: UseWebSocketOptions = {}) => {
  const {
    autoConnect = true,
    reconnectAttempts = 5,
    reconnectInterval = 3000,
    onMessage,
    onConnect,
    onDisconnect,
    onError
  } = options;

  const { backendUser } = useAuth();
  const { toast } = useToast();
  
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [messageHistory, setMessageHistory] = useState<WebSocketMessage[]>([]);
  
  const ws = useRef<WebSocket | null>(null);
  const reconnectCount = useRef(0);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimer = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (!backendUser?.id) return;

    try {
      const wsBase = API_BASE_URL.replace(/^http/, 'ws');
      const wsUrl = `${wsBase}/ws/notifications/${backendUser.id}`;
      ws.current = new WebSocket(wsUrl);
      setConnectionStatus('connecting');

      ws.current.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setConnectionStatus('connected');
        reconnectCount.current = 0;
        
        // Start heartbeat
        heartbeatTimer.current = setInterval(() => {
          if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'heartbeat' }));
          }
        }, 30000);

        onConnect?.();
        
        toast({
          title: "🔄 Real-time Updates",
          description: "Connected! You'll receive live updates for jobs and applications.",
          duration: 3000,
        });
      };

      ws.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          setLastMessage(message);
          setMessageHistory(prev => [message, ...prev.slice(0, 99)]); // Keep last 100 messages
          
          onMessage?.(message);
          handleIncomingMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.current.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        setConnectionStatus('disconnected');
        
        if (heartbeatTimer.current) {
          clearInterval(heartbeatTimer.current);
          heartbeatTimer.current = null;
        }

        onDisconnect?.();
        
        // Attempt reconnection
        if (reconnectCount.current < reconnectAttempts) {
          reconnectCount.current++;
          reconnectTimer.current = setTimeout(() => {
            console.log(`Attempting to reconnect... (${reconnectCount.current}/${reconnectAttempts})`);
            connect();
          }, reconnectInterval);
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('error');
        onError?.(error);
      };

    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      setConnectionStatus('error');
    }
  }, [backendUser?.id, onConnect, onDisconnect, onError, onMessage, reconnectAttempts, reconnectInterval, toast]);

  const handleIncomingMessage = (message: WebSocketMessage) => {
    switch (message.type) {
      case 'job_match':
        toast({
          title: "🎯 New Job Match!",
          description: `Found ${message.data.matchCount} new job matches with ${message.data.avgScore}% average match score`,
          duration: 5000,
        });
        break;
        
      case 'application_update':
        const status = message.data.status;
        const jobTitle = message.data.jobTitle;
        const company = message.data.company;
        
        if (status === 'submitted') {
          toast({
            title: "✅ Application Submitted",
            description: `Successfully applied to ${jobTitle} at ${company}`,
            duration: 4000,
          });
        } else if (status === 'viewed') {
          toast({
            title: "👀 Application Viewed",
            description: `Your application for ${jobTitle} at ${company} has been viewed!`,
            duration: 4000,
          });
        } else if (status === 'interview') {
          toast({
            title: "🎉 Interview Request!",
            description: `Interview request for ${jobTitle} at ${company}`,
            duration: 6000,
          });
        }
        break;
        
      case 'notification':
        toast({
          title: message.data.title || "📬 New Notification",
          description: message.data.message,
          duration: message.data.duration || 4000,
        });
        break;
        
      case 'ai_analysis_complete':
        toast({
          title: "🤖 AI Analysis Complete",
          description: `${message.data.analysisType} analysis finished with ${message.data.score}% score`,
          duration: 4000,
        });
        break;
        
      case 'system_update':
        toast({
          title: "🔄 System Update",
          description: message.data.message,
          duration: 3000,
        });
        break;
        
      case 'real_time_match':
        toast({
          title: "⚡ Live Job Match!",
          description: `${message.data.jobTitle} at ${message.data.company} - ${message.data.matchScore}% match`,
          duration: 6000,
        });
        break;
        
      case 'automation_progress':
        toast({
          title: "🤖 Automation Update",
          description: `${message.data.action}: ${message.data.progress}% complete`,
          duration: 2000,
        });
        break;
        
      case 'market_update':
        toast({
          title: "📊 Market Intelligence",
          description: message.data.insight || "New market data available",
          duration: 4000,
        });
        break;
        
      case 'skill_recommendation':
        toast({
          title: "🎯 Skill Recommendation",
          description: `Consider learning: ${message.data.skill} (${message.data.demand} demand)`,
          duration: 5000,
        });
        break;
        
      case 'live_analytics':
        // Handle live analytics updates (don't show toast, just update data)
        console.log('Live analytics update:', message.data);
        break;
    }
  };

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    
    if (heartbeatTimer.current) {
      clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = null;
    }
    
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    
    setIsConnected(false);
    setConnectionStatus('disconnected');
  }, []);

  const sendMessage = useCallback((message: Partial<WebSocketMessage>) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      const fullMessage = {
        ...message,
        timestamp: new Date().toISOString(),
        id: Math.random().toString(36).substr(2, 9)
      };
      ws.current.send(JSON.stringify(fullMessage));
      return true;
    }
    return false;
  }, []);

  // Auto-connect when user is available
  useEffect(() => {
    if (autoConnect && backendUser?.id && !ws.current) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, backendUser?.id, connect, disconnect]);

  return {
    isConnected,
    connectionStatus,
    lastMessage,
    messageHistory,
    connect,
    disconnect,
    sendMessage,
  };
};

// Specialized hooks for specific use cases
export const useJobUpdates = () => {
  const [jobMatches, setJobMatches] = useState<any[]>([]);
  const [applicationUpdates, setApplicationUpdates] = useState<any[]>([]);

  const { isConnected, sendMessage } = useWebSocket({
    onMessage: (message) => {
      if (message.type === 'job_match') {
        setJobMatches(prev => [message.data, ...prev.slice(0, 19)]); // Keep last 20
      } else if (message.type === 'application_update') {
        setApplicationUpdates(prev => [message.data, ...prev.slice(0, 49)]); // Keep last 50
      }
    }
  });

  const requestJobUpdate = useCallback(() => {
    sendMessage({ type: 'system_update', data: { action: 'request_job_update' } });
  }, [sendMessage]);

  return {
    isConnected,
    jobMatches,
    applicationUpdates,
    requestJobUpdate
  };
};

export const useNotificationUpdates = () => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const { isConnected } = useWebSocket({
    onMessage: (message) => {
      if (message.type === 'notification') {
        setNotifications(prev => [message.data, ...prev.slice(0, 99)]);
        if (!message.data.isRead) {
          setUnreadCount(prev => prev + 1);
        }
      }
    }
  });

  const markAsRead = useCallback((notificationId: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  return {
    isConnected,
    notifications,
    unreadCount,
    markAsRead
  };
}; 