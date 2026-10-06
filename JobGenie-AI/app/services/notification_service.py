import asyncio
import json
import logging
import os
import smtplib
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
import ssl
import aiohttp
import websockets
from jinja2 import Template

# Email providers (optional — degrade gracefully if not installed, mirroring the
# pattern used for other optional heavy dependencies such as CrewAI/langchain)
try:
    import sendgrid
    from sendgrid.helpers.mail import Mail
except ImportError:
    sendgrid = None  # type: ignore
    Mail = None  # type: ignore

logger = logging.getLogger(__name__)

class NotificationService:
    """Comprehensive notification service for JobGenie platform"""
    
    def __init__(self):
        # Email configuration
        self.sendgrid_api_key = os.getenv('SENDGRID_API_KEY')
        self.smtp_server = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
        self.smtp_port = int(os.getenv('SMTP_PORT', '587'))
        self.smtp_username = os.getenv('SMTP_USERNAME')
        self.smtp_password = os.getenv('SMTP_PASSWORD')
        self.from_email = os.getenv('FROM_EMAIL', 'noreply@jobgenie.com')
        
        # WebSocket configuration for real-time notifications
        self.websocket_connections = {}
        self.notification_history = []
        
        # Notification templates
        self.email_templates = self._load_email_templates()
        
        # Rate limiting
        self.rate_limits = {
            'email': {'max_per_hour': 100, 'current': 0, 'reset_time': datetime.now()},
            'websocket': {'max_per_minute': 1000, 'current': 0, 'reset_time': datetime.now()}
        }
        
        self.is_initialized = False
    
    async def initialize(self):
        """Initialize the notification service"""
        try:
            # Validate configuration
            if not any([self.sendgrid_api_key, self.smtp_username]):
                logger.warning("No email configuration found. Email notifications will be disabled.")
            
            self.is_initialized = True
            logger.info("Notification Service initialized successfully")
            
        except Exception as e:
            logger.error(f"Error initializing Notification Service: {e}")
            raise
    
    def _load_email_templates(self) -> Dict[str, str]:
        """Load email templates for different notification types"""
        return {
            'job_search_results': """
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    .header { background-color: #4f46e5; color: white; padding: 20px; text-align: center; }
                    .content { padding: 20px; }
                    .job-item { border: 1px solid #e5e7eb; margin: 10px 0; padding: 15px; border-radius: 8px; }
                    .job-title { font-weight: bold; color: #1f2937; }
                    .company { color: #6b7280; }
                    .location { color: #9ca3af; }
                    .footer { background-color: #f9fafb; padding: 20px; text-align: center; color: #6b7280; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>JobGenie - New Job Opportunities</h1>
                </div>
                <div class="content">
                    <h2>Hello {{ user_name }},</h2>
                    <p>We found <strong>{{ jobs_count }}</strong> new job opportunities matching your preferences:</p>
                    
                    {% for job in jobs %}
                    <div class="job-item">
                        <div class="job-title">{{ job.title }}</div>
                        <div class="company">{{ job.company }}</div>
                        <div class="location">{{ job.location }}</div>
                        <p>{{ job.description[:200] }}...</p>
                        <a href="{{ job.url }}" style="background-color: #4f46e5; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px;">View Job</a>
                    </div>
                    {% endfor %}
                    
                    <p><a href="{{ dashboard_url }}">View all jobs in your dashboard</a></p>
                </div>
                <div class="footer">
                    <p>JobGenie - Your AI-Powered Job Search Assistant</p>
                </div>
            </body>
            </html>
            """,
            
            'application_success': """
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    .header { background-color: #10b981; color: white; padding: 20px; text-align: center; }
                    .content { padding: 20px; }
                    .success-icon { color: #10b981; font-size: 24px; }
                    .job-details { background-color: #f0fdf4; padding: 15px; border-radius: 8px; margin: 15px 0; }
                    .footer { background-color: #f9fafb; padding: 20px; text-align: center; color: #6b7280; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>✅ Application Submitted Successfully!</h1>
                </div>
                <div class="content">
                    <h2>Great news, {{ user_name }}!</h2>
                    <p>Your job application has been successfully submitted:</p>
                    
                    <div class="job-details">
                        <h3>{{ job_title }}</h3>
                        <p><strong>Company:</strong> {{ company }}</p>
                        <p><strong>Location:</strong> {{ location }}</p>
                        <p><strong>Applied on:</strong> {{ application_date }}</p>
                        <p><strong>Application ID:</strong> {{ application_id }}</p>
                    </div>
                    
                    <h3>Next Steps:</h3>
                    <ul>
                        <li>Follow up with the hiring manager in 1 week if you don't hear back</li>
                        <li>Prepare for potential interview questions</li>
                        <li>Continue applying to similar positions</li>
                    </ul>
                    
                    <p><a href="{{ dashboard_url }}">Track your applications in the dashboard</a></p>
                </div>
                <div class="footer">
                    <p>JobGenie - Your AI-Powered Job Search Assistant</p>
                </div>
            </body>
            </html>
            """,
            
            'schedule_notification': """
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    .header { background-color: #f59e0b; color: white; padding: 20px; text-align: center; }
                    .content { padding: 20px; }
                    .schedule-info { background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0; }
                    .footer { background-color: #f9fafb; padding: 20px; text-align: center; color: #6b7280; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>⏰ Scheduled Job Search Update</h1>
                </div>
                <div class="content">
                    <h2>Hello {{ user_name }},</h2>
                    <p>Your scheduled job search has been completed:</p>
                    
                    <div class="schedule-info">
                        <p><strong>Search performed:</strong> {{ search_date }}</p>
                        <p><strong>Keywords:</strong> {{ keywords }}</p>
                        <p><strong>Location:</strong> {{ location }}</p>
                        <p><strong>Platforms searched:</strong> {{ platforms }}</p>
                        <p><strong>Jobs found:</strong> {{ jobs_found }}</p>
                    </div>
                    
                    <p>Next scheduled search: {{ next_search_date }}</p>
                    
                    <p><a href="{{ dashboard_url }}">View results in your dashboard</a></p>
                </div>
                <div class="footer">
                    <p>JobGenie - Your AI-Powered Job Search Assistant</p>
                </div>
            </body>
            </html>
            """,
            
            'error_notification': """
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    .header { background-color: #ef4444; color: white; padding: 20px; text-align: center; }
                    .content { padding: 20px; }
                    .error-details { background-color: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 8px; margin: 15px 0; }
                    .footer { background-color: #f9fafb; padding: 20px; text-align: center; color: #6b7280; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>❌ JobGenie Alert</h1>
                </div>
                <div class="content">
                    <h2>Hello {{ user_name }},</h2>
                    <p>We encountered an issue with your JobGenie automation:</p>
                    
                    <div class="error-details">
                        <p><strong>Error Type:</strong> {{ error_type }}</p>
                        <p><strong>Time:</strong> {{ error_time }}</p>
                        <p><strong>Details:</strong> {{ error_message }}</p>
                    </div>
                    
                    <p>Our team has been notified and will investigate this issue. You can also contact support for assistance.</p>
                    
                    <p><a href="{{ dashboard_url }}">Check your dashboard</a> | <a href="{{ support_url }}">Contact Support</a></p>
                </div>
                <div class="footer">
                    <p>JobGenie - Your AI-Powered Job Search Assistant</p>
                </div>
            </body>
            </html>
            """
        }

    def _finalize_notification(self, notification_data: Dict[str, Any], title: str, message: str) -> Dict[str, Any]:
        """Stamp a notification with the fields the history/read/stats endpoints and the
        frontend notifications page rely on (id for mark-as-read, isRead/createdAt for
        display). Without an 'id', mark_notification_as_read can never match a stored
        notification, so this must run before every notification_history.append()."""
        notification_data['id'] = str(uuid.uuid4())
        notification_data['title'] = title
        notification_data['message'] = message
        notification_data['read'] = False
        notification_data['isRead'] = False
        notification_data['createdAt'] = notification_data.get('timestamp', datetime.now().isoformat())
        return notification_data

    async def send_job_search_notification(self, user_id: str, jobs_found: int,
                                         new_jobs: List[Dict[str, Any]], 
                                         search_summary: Dict[str, Any]) -> bool:
        """Send notification about new job search results"""
        try:
            user_info = await self._get_user_info(user_id)
            
            # Prepare notification data
            notification_data = {
                'type': 'job_search_results',
                'user_id': user_id,
                'user_name': user_info.get('name', 'User'),
                'user_email': user_info.get('email'),
                'jobs_count': jobs_found,
                'jobs': new_jobs,
                'search_summary': search_summary,
                'dashboard_url': f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/dashboard",
                'timestamp': datetime.now().isoformat()
            }
            
            # Send email notification
            email_sent = await self._send_email_notification(
                to_email=user_info.get('email'),
                subject=f"JobGenie: {jobs_found} new job opportunities found!",
                template_name='job_search_results',
                template_data=notification_data
            )
            
            # Send real-time WebSocket notification
            websocket_sent = await self._send_websocket_notification(user_id, {
                'type': 'job_search_update',
                'data': notification_data
            })
            
            # Store notification in history
            self._finalize_notification(
                notification_data,
                title=f"{jobs_found} New Job Opportunities",
                message=f"We found {jobs_found} new job opportunities matching your preferences.",
            )
            self.notification_history.append(notification_data)

            logger.info(f"Job search notification sent to user {user_id}: {jobs_found} jobs")
            return email_sent or websocket_sent
            
        except Exception as e:
            logger.error(f"Error sending job search notification: {e}")
            return False
    
    async def send_application_success_notification(self, user_id: str, 
                                                  application_data: Dict[str, Any]) -> bool:
        """Send notification about successful job application"""
        try:
            user_info = await self._get_user_info(user_id)
            
            notification_data = {
                'type': 'application_success',
                'user_id': user_id,
                'user_name': user_info.get('name', 'User'),
                'user_email': user_info.get('email'),
                'job_title': application_data.get('job_title'),
                'company': application_data.get('company'),
                'location': application_data.get('location'),
                'application_date': application_data.get('applied_at', datetime.now().isoformat()),
                'application_id': application_data.get('application_id'),
                'dashboard_url': f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/applications",
                'timestamp': datetime.now().isoformat()
            }
            
            # Send email notification
            email_sent = await self._send_email_notification(
                to_email=user_info.get('email'),
                subject=f"Application Submitted: {application_data.get('job_title')}",
                template_name='application_success',
                template_data=notification_data
            )
            
            # Send real-time notification
            websocket_sent = await self._send_websocket_notification(user_id, {
                'type': 'application_success',
                'data': notification_data
            })
            
            self._finalize_notification(
                notification_data,
                title="Application Submitted",
                message=f"Your application for {application_data.get('job_title')} at {application_data.get('company')} was submitted successfully.",
            )
            self.notification_history.append(notification_data)

            logger.info(f"Application success notification sent to user {user_id}")
            return email_sent or websocket_sent
            
        except Exception as e:
            logger.error(f"Error sending application success notification: {e}")
            return False
    
    async def send_schedule_notification(self, user_id: str, schedule_data: Dict[str, Any]) -> bool:
        """Send notification about scheduled job search completion"""
        try:
            user_info = await self._get_user_info(user_id)
            
            notification_data = {
                'type': 'schedule_notification',
                'user_id': user_id,
                'user_name': user_info.get('name', 'User'),
                'user_email': user_info.get('email'),
                'search_date': schedule_data.get('search_date'),
                'keywords': ', '.join(schedule_data.get('keywords', [])),
                'location': schedule_data.get('location'),
                'platforms': ', '.join(schedule_data.get('platforms_searched', [])),
                'jobs_found': schedule_data.get('jobs_found'),
                'next_search_date': schedule_data.get('next_search_date'),
                'dashboard_url': f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/dashboard",
                'timestamp': datetime.now().isoformat()
            }
            
            # Send email notification
            email_sent = await self._send_email_notification(
                to_email=user_info.get('email'),
                subject=f"Scheduled Search Complete: {schedule_data.get('jobs_found')} jobs found",
                template_name='schedule_notification',
                template_data=notification_data
            )
            
            # Send real-time notification
            websocket_sent = await self._send_websocket_notification(user_id, {
                'type': 'schedule_update',
                'data': notification_data
            })
            
            self._finalize_notification(
                notification_data,
                title="Scheduled Search Complete",
                message=f"Your scheduled job search found {schedule_data.get('jobs_found')} jobs.",
            )
            self.notification_history.append(notification_data)

            logger.info(f"Schedule notification sent to user {user_id}")
            return email_sent or websocket_sent
            
        except Exception as e:
            logger.error(f"Error sending schedule notification: {e}")
            return False
    
    async def send_error_notification(self, user_id: str, error_type: str, 
                                    error_message: str) -> bool:
        """Send notification about system errors"""
        try:
            user_info = await self._get_user_info(user_id)
            
            notification_data = {
                'type': 'error_notification',
                'user_id': user_id,
                'user_name': user_info.get('name', 'User'),
                'user_email': user_info.get('email'),
                'error_type': error_type,
                'error_message': error_message,
                'error_time': datetime.now().isoformat(),
                'dashboard_url': f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/dashboard",
                'support_url': f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/support",
                'timestamp': datetime.now().isoformat()
            }
            
            # Send email notification
            email_sent = await self._send_email_notification(
                to_email=user_info.get('email'),
                subject=f"JobGenie Alert: {error_type}",
                template_name='error_notification',
                template_data=notification_data
            )
            
            # Send real-time notification
            websocket_sent = await self._send_websocket_notification(user_id, {
                'type': 'error_alert',
                'data': notification_data
            })
            
            self._finalize_notification(
                notification_data,
                title=f"Alert: {error_type}",
                message=error_message,
            )
            self.notification_history.append(notification_data)

            logger.info(f"Error notification sent to user {user_id}: {error_type}")
            return email_sent or websocket_sent
            
        except Exception as e:
            logger.error(f"Error sending error notification: {e}")
            return False
    
    async def _send_email_notification(self, to_email: str, subject: str, 
                                     template_name: str, template_data: Dict[str, Any]) -> bool:
        """Send email notification using configured email service"""
        try:
            if not to_email:
                logger.warning("No email address provided for notification")
                return False
            
            # Check rate limits
            if not self._check_rate_limit('email'):
                logger.warning("Email rate limit exceeded")
                return False
            
            # Render email template
            html_content = self._render_email_template(template_name, template_data)
            
            # Use SendGrid if configured and the package is installed, otherwise fallback to SMTP
            if self.sendgrid_api_key and sendgrid is not None:
                return await self._send_sendgrid_email(to_email, subject, html_content)
            elif self.sendgrid_api_key and sendgrid is None:
                logger.warning(
                    "SENDGRID_API_KEY is set but the 'sendgrid' package is not installed; "
                    "falling back to SMTP/logged mode"
                )
                if self.smtp_username:
                    return await self._send_smtp_email(to_email, subject, html_content)
                logger.info(f"[degraded mode] Would send email to {to_email}: {subject}")
                return False
            elif self.smtp_username:
                return await self._send_smtp_email(to_email, subject, html_content)
            else:
                logger.warning("No email service configured")
                return False
                
        except Exception as e:
            logger.error(f"Error sending email notification: {e}")
            return False
    
    async def _send_sendgrid_email(self, to_email: str, subject: str, html_content: str) -> bool:
        """Send email using SendGrid service"""
        try:
            sg = sendgrid.SendGridAPIClient(api_key=self.sendgrid_api_key)
            
            message = Mail(
                from_email=self.from_email,
                to_emails=to_email,
                subject=subject,
                html_content=html_content
            )
            
            response = sg.send(message)
            
            if response.status_code in [200, 201, 202]:
                self._increment_rate_limit('email')
                logger.info(f"SendGrid email sent successfully to {to_email}")
                return True
            else:
                logger.error(f"SendGrid email failed: {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"Error sending SendGrid email: {e}")
            return False
    
    async def _send_smtp_email(self, to_email: str, subject: str, html_content: str) -> bool:
        """Send email using SMTP"""
        try:
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = self.from_email
            msg['To'] = to_email
            
            html_part = MIMEText(html_content, 'html')
            msg.attach(html_part)
            
            # Create SSL context
            context = ssl.create_default_context()
            
            # Send email
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls(context=context)
                server.login(self.smtp_username, self.smtp_password)
                server.send_message(msg)
            
            self._increment_rate_limit('email')
            logger.info(f"SMTP email sent successfully to {to_email}")
            return True
            
        except Exception as e:
            logger.error(f"Error sending SMTP email: {e}")
            return False
    
    async def _send_websocket_notification(self, user_id: str, notification: Dict[str, Any]) -> bool:
        """Send real-time notification via WebSocket"""
        try:
            if not self._check_rate_limit('websocket'):
                logger.warning("WebSocket rate limit exceeded")
                return False
            
            # Get user's WebSocket connection
            user_connection = self.websocket_connections.get(user_id)
            
            if user_connection:
                try:
                    await user_connection.send(json.dumps(notification))
                    self._increment_rate_limit('websocket')
                    logger.info(f"WebSocket notification sent to user {user_id}")
                    return True
                except websockets.exceptions.ConnectionClosed:
                    # Remove closed connection
                    del self.websocket_connections[user_id]
                    logger.info(f"Removed closed WebSocket connection for user {user_id}")
            
            # Try to send via HTTP webhook if WebSocket is not available
            return await self._send_webhook_notification(user_id, notification)
            
        except Exception as e:
            logger.error(f"Error sending WebSocket notification: {e}")
            return False
    
    async def _send_webhook_notification(self, user_id: str, notification: Dict[str, Any]) -> bool:
        """Send notification via HTTP webhook as fallback"""
        try:
            webhook_url = f"{os.getenv('BACKEND_URL', 'http://api-gateway:8080')}/api/notifications/webhook"
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    webhook_url,
                    json={
                        'user_id': user_id,
                        'notification': notification
                    },
                    headers={'Content-Type': 'application/json'}
                ) as response:
                    if response.status == 200:
                        logger.info(f"Webhook notification sent for user {user_id}")
                        return True
                    else:
                        logger.warning(f"Webhook notification failed: {response.status}")
                        return False
                        
        except Exception as e:
            logger.error(f"Error sending webhook notification: {e}")
            return False
    
    def _render_email_template(self, template_name: str, template_data: Dict[str, Any]) -> str:
        """Render email template with provided data"""
        try:
            template_content = self.email_templates.get(template_name, '')
            if not template_content:
                logger.warning(f"Template {template_name} not found")
                return "<p>Notification content not available</p>"
            
            template = Template(template_content)
            return template.render(**template_data)
            
        except Exception as e:
            logger.error(f"Error rendering email template: {e}")
            return "<p>Error rendering notification</p>"
    
    def _check_rate_limit(self, notification_type: str) -> bool:
        """Check if notification type is within rate limits"""
        try:
            now = datetime.now()
            rate_limit = self.rate_limits.get(notification_type, {})
            
            # Reset counters if time window has passed
            if notification_type == 'email':
                if now - rate_limit.get('reset_time', now) > timedelta(hours=1):
                    rate_limit['current'] = 0
                    rate_limit['reset_time'] = now
            elif notification_type == 'websocket':
                if now - rate_limit.get('reset_time', now) > timedelta(minutes=1):
                    rate_limit['current'] = 0
                    rate_limit['reset_time'] = now
            
            # Check if within limits
            max_allowed = rate_limit.get('max_per_hour' if notification_type == 'email' else 'max_per_minute', 0)
            current_count = rate_limit.get('current', 0)
            
            return current_count < max_allowed
            
        except Exception as e:
            logger.error(f"Error checking rate limit: {e}")
            return True  # Allow on error
    
    def _increment_rate_limit(self, notification_type: str):
        """Increment rate limit counter"""
        try:
            if notification_type in self.rate_limits:
                self.rate_limits[notification_type]['current'] += 1
        except Exception as e:
            logger.error(f"Error incrementing rate limit: {e}")
    
    async def _get_user_info(self, user_id: str) -> Dict[str, Any]:
        """Get user information from backend service"""
        try:
            # This would typically make an API call to the user service
            backend_url = os.getenv('BACKEND_URL', 'http://api-gateway:8080')
            
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{backend_url}/api/users/{user_id}") as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        logger.warning(f"Failed to get user info for {user_id}")
                        return {'name': 'User', 'email': None}
                        
        except Exception as e:
            logger.error(f"Error getting user info: {e}")
            return {'name': 'User', 'email': None}
    
    async def register_websocket_connection(self, user_id: str, websocket):
        """Register a WebSocket connection for a user"""
        try:
            self.websocket_connections[user_id] = websocket
            logger.info(f"Registered WebSocket connection for user {user_id}")
        except Exception as e:
            logger.error(f"Error registering WebSocket connection: {e}")
    
    async def unregister_websocket_connection(self, user_id: str):
        """Unregister a WebSocket connection for a user"""
        try:
            if user_id in self.websocket_connections:
                del self.websocket_connections[user_id]
                logger.info(f"Unregistered WebSocket connection for user {user_id}")
        except Exception as e:
            logger.error(f"Error unregistering WebSocket connection: {e}")
    
    async def get_notification_history(self, user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get notification history for a user"""
        try:
            user_notifications = [
                notif for notif in self.notification_history 
                if notif.get('user_id') == user_id
            ]
            
            # Sort by timestamp (newest first) and limit
            user_notifications.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
            return user_notifications[:limit]
            
        except Exception as e:
            logger.error(f"Error getting notification history: {e}")
            return []
    
    async def mark_notification_as_read(self, user_id: str, notification_id: str) -> bool:
        """Mark a notification as read"""
        try:
            for notif in self.notification_history:
                if notif.get('user_id') == user_id and notif.get('id') == notification_id:
                    notif['read'] = True
                    notif['isRead'] = True
                    notif['read_at'] = datetime.now().isoformat()
                    return True
            return False
            
        except Exception as e:
            logger.error(f"Error marking notification as read: {e}")
            return False
    
    async def get_notification_stats(self, user_id: str = None) -> Dict[str, Any]:
        """Get notification statistics"""
        try:
            if user_id:
                user_notifications = [
                    notif for notif in self.notification_history 
                    if notif.get('user_id') == user_id
                ]
                notifications = user_notifications
            else:
                notifications = self.notification_history
            
            unread_count = len([n for n in notifications if not n.get('read', False)])
            stats = {
                'total_notifications': len(notifications),
                'unread_notifications': unread_count,
                # Alias expected by the frontend notifications page (statsData.unread)
                'unread': unread_count,
                'notifications_by_type': {},
                'notifications_last_24h': 0,
                'notifications_last_week': 0
            }
            
            now = datetime.now()
            for notif in notifications:
                # Count by type
                notif_type = notif.get('type', 'unknown')
                stats['notifications_by_type'][notif_type] = stats['notifications_by_type'].get(notif_type, 0) + 1
                
                # Count recent notifications
                try:
                    notif_time = datetime.fromisoformat(notif.get('timestamp', ''))
                    if now - notif_time < timedelta(hours=24):
                        stats['notifications_last_24h'] += 1
                    if now - notif_time < timedelta(days=7):
                        stats['notifications_last_week'] += 1
                except:
                    pass
            
            return stats
            
        except Exception as e:
            logger.error(f"Error getting notification stats: {e}")
            return {}

# Export the main class
__all__ = ['NotificationService'] 