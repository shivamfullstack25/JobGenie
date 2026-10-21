import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Card, CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {apiRequest} from "@/lib/queryClient";
import Navigation from "@/components/navigation";
import {useAuth} from "@/context/AuthContext";

export default function Notifications() {
  const queryClient = useQueryClient();
  const { backendUser } = useAuth();
  const userId = backendUser?.id;

  const { data: notifications = [] } = useQuery({
    queryKey: [`/api/notifications/history/${userId}`],
    enabled: !!userId,
    // The endpoint responds with { notifications: [...] }, not a bare array —
    // unwrap it here so .filter() below doesn't throw on the raw object.
    select: (data: any) => (Array.isArray(data) ? data : (data?.notifications ?? [])),
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      return await apiRequest(`/api/notifications/${notificationId}/read?user_id=${userId}`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/notifications/history/${userId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/notifications/stats/${userId}`] });
    },
  });

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'job_match':
      case 'job_search_results':
        return 'fas fa-bullseye text-blue-600';
      case 'application_sent':
      case 'application_success':
        return 'fas fa-paper-plane text-green-600';
      case 'schedule_completed':
      case 'schedule_notification':
        return 'fas fa-clock text-purple-600';
      case 'ats_resume_generated':
        return 'fas fa-magic text-orange-600';
      case 'auto_apply_summary':
        return 'fas fa-robot text-purple-600';
      case 'error_notification':
        return 'fas fa-triangle-exclamation text-red-600';
      default:
        return 'fas fa-bell text-gray-600';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'job_match':
      case 'job_search_results':
        return 'border-blue-200 bg-blue-50';
      case 'application_sent':
      case 'application_success':
        return 'border-green-200 bg-green-50';
      case 'schedule_completed':
      case 'schedule_notification':
        return 'border-purple-200 bg-purple-50';
      case 'ats_resume_generated':
        return 'border-orange-200 bg-orange-50';
      case 'auto_apply_summary':
        return 'border-purple-200 bg-purple-50';
      case 'error_notification':
        return 'border-red-200 bg-red-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  const formatRelativeTime = (date: string) => {
    const now = new Date();
    const notificationDate = new Date(date);
    const diffInMinutes = Math.floor((now.getTime() - notificationDate.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    
    return notificationDate.toLocaleDateString();
  };

  const unreadNotifications = notifications.filter((n: any) => !n.isRead);
  const readNotifications = notifications.filter((n: any) => n.isRead);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <i className="fas fa-bell mr-3 text-primary-600"></i>
            Notifications
          </h1>
          <p className="text-gray-600 mt-2">
            Stay updated with your job search activity and AI-generated insights
          </p>
        </div>

        {/* Unread Notifications */}
        {unreadNotifications.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <i className="fas fa-circle mr-2 text-blue-600 text-xs"></i>
              Unread ({unreadNotifications.length})
            </h2>
            <div className="space-y-4">
              {unreadNotifications.map((notification: any) => (
                <Card
                  key={notification.id}
                  className={`border-l-4 ${getNotificationColor(notification.type)} hover:shadow-md transition-shadow`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3 flex-1">
                        <i className={`${getNotificationIcon(notification.type)} text-lg mt-1`}></i>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 mb-1">
                            {notification.title}
                          </h3>
                          <p className="text-gray-700 mb-2">
                            {notification.message}
                          </p>
                          <div className="flex items-center space-x-4">
                            <span className="text-sm text-gray-500">
                              {formatRelativeTime(notification.createdAt)}
                            </span>
                            {notification.data && (
                              <div className="flex space-x-2">
                                {notification.data.atsScore && (
                                  <Badge variant="outline">
                                    ATS: {notification.data.atsScore}%
                                  </Badge>
                                )}
                                {notification.data.platform && (
                                  <Badge variant="secondary">
                                    {notification.data.platform}
                                  </Badge>
                                )}
                                {notification.data.topMatchScore && (
                                  <Badge variant="outline">
                                    Match: {notification.data.topMatchScore}%
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        onClick={() => markAsReadMutation.mutate(notification.id)}
                        variant="outline"
                        size="sm"
                        disabled={markAsReadMutation.isPending}
                      >
                        {markAsReadMutation.isPending ? (
                          <i className="fas fa-spinner fa-spin"></i>
                        ) : (
                          <i className="fas fa-check"></i>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Read Notifications */}
        {readNotifications.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <i className="fas fa-check-circle mr-2 text-green-600"></i>
              Read Notifications
            </h2>
            <div className="space-y-4">
              {readNotifications.map((notification: any) => (
                <Card
                  key={notification.id}
                  className="border-gray-200 opacity-75 hover:opacity-100 transition-opacity"
                >
                  <CardContent className="p-4">
                    <div className="flex items-start space-x-3">
                      <i className={`${getNotificationIcon(notification.type)} text-lg mt-1 opacity-60`}></i>
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-700 mb-1">
                          {notification.title}
                        </h3>
                        <p className="text-gray-600 mb-2">
                          {notification.message}
                        </p>
                        <div className="flex items-center space-x-4">
                          <span className="text-sm text-gray-500">
                            {formatRelativeTime(notification.createdAt)}
                          </span>
                          {notification.data && (
                            <div className="flex space-x-2">
                              {notification.data.atsScore && (
                                <Badge variant="outline" className="opacity-70">
                                  ATS: {notification.data.atsScore}%
                                </Badge>
                              )}
                              {notification.data.platform && (
                                <Badge variant="secondary" className="opacity-70">
                                  {notification.data.platform}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {notifications.length === 0 && (
          <Card>
            <CardContent className="text-center py-12">
              <i className="fas fa-bell-slash text-6xl text-gray-300 mb-4"></i>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                No Notifications Yet
              </h3>
              <p className="text-gray-600 mb-6">
                Your job search activity and AI insights will appear here
              </p>
              <div className="text-sm text-gray-500">
                <p>You'll receive notifications for:</p>
                <ul className="mt-2 space-y-1">
                  <li>• Job matches found by our AI</li>
                  <li>• Successful job applications</li>
                  <li>• ATS resume generation completion</li>
                  <li>• Automated search cycle results</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}