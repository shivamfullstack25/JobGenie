package com.jobgenie.notificationservice.service;

import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import com.jobgenie.shared.exception.JobGenieException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
@RequiredArgsConstructor
public class NotificationServiceImpl implements NotificationService {

  private final JavaMailSender emailSender;
  private final RestTemplate restTemplate;

  @Value("${user.service.url:http://user-service:8082}")
  private String userServiceUrl;

  @Value("${sms.service.url:http://sms-service:8085}")
  private String smsServiceUrl;

  @Value("${push.service.url:http://push-service:8086}")
  private String pushServiceUrl;

  @Override
  public boolean sendEmailNotification(String to, String subject, String content) {
    try {
      log.info("Sending email notification to: {}", to);

      SimpleMailMessage message = new SimpleMailMessage();
      message.setTo(to);
      message.setSubject(subject);
      message.setText(content);

      emailSender.send(message);
      log.info("Email notification sent successfully to: {}", to);
      return true;
    } catch (Exception e) {
      log.error("Failed to send email notification to: {}", to, e);
      throw new JobGenieException(
          "Failed to send email notification: " + e.getMessage(), "EMAIL_SEND_ERROR");
    }
  }

  @Override
  @SuppressWarnings("unchecked")
  public boolean sendSMSNotification(String phoneNumber, String message) {
    try {
      log.info("Sending SMS notification to: {}", phoneNumber);

      // For now, we'll log SMS notifications as the external SMS service isn't set up
      // In production, this would integrate with Twilio, AWS SNS, or similar
      log.info("SMS would be sent to {}: {}", phoneNumber, message);

      // Simulate successful SMS for demo purposes
      return true;

    } catch (Exception e) {
      log.error("Failed to send SMS notification to: {}", phoneNumber, e);
      // Fallback to email if SMS fails
      try {
        String subject = "JobGenie SMS Notification";
        String emailContent = "You have a new notification: " + message;

        // Try to get user email and send email instead
        ResponseEntity<Map> userResponse =
            restTemplate.getForEntity(
                userServiceUrl + "/api/users/phone/" + phoneNumber, Map.class);

        if (userResponse.getStatusCode().is2xxSuccessful() && userResponse.getBody() != null) {
          Map<String, Object> userData = userResponse.getBody();
          String email = (String) userData.get("email");
          if (email != null) {
            return sendEmailNotification(email, subject, emailContent);
          }
        }
      } catch (Exception fallbackException) {
        log.error("SMS fallback to email also failed", fallbackException);
      }
      return false;
    }
  }

  @Override
  @SuppressWarnings("unchecked")
  public boolean sendPushNotification(String userId, String title, String message) {
    try {
      log.info("Sending push notification to user: {}", userId);

      // For now, we'll log push notifications as the external push service isn't set up
      // In production, this would integrate with Firebase FCM, Apple Push Notifications, etc.
      log.info("Push notification would be sent to user {}: {} - {}", userId, title, message);

      // Simulate successful push for demo purposes
      return true;

    } catch (Exception e) {
      log.error("Failed to send push notification to user: {}", userId, e);
      // Fallback to email notification
      try {
        ResponseEntity<Map> userResponse =
            restTemplate.getForEntity(userServiceUrl + "/api/users/" + userId, Map.class);

        if (userResponse.getStatusCode().is2xxSuccessful() && userResponse.getBody() != null) {
          Map<String, Object> userData = userResponse.getBody();
          String email = (String) userData.get("email");
          if (email != null) {
            return sendEmailNotification(email, title, message);
          }
        }
      } catch (Exception fallbackException) {
        log.error("Push notification fallback to email also failed", fallbackException);
      }
      return false;
    }
  }

  @Override
  @SuppressWarnings("unchecked")
  public boolean sendJobApplicationNotification(
      String userId, String jobTitle, String companyName) {
    try {
      log.info("Sending job application notification to user: {}", userId);

      // Get user email from user service
      ResponseEntity<Map> userResponse =
          restTemplate.getForEntity(userServiceUrl + "/api/users/" + userId, Map.class);

      if (!userResponse.getStatusCode().is2xxSuccessful() || userResponse.getBody() == null) {
        throw new JobGenieException("Failed to get user information", "USER_SERVICE_ERROR");
      }

      Map<String, Object> userData = userResponse.getBody();
      String userEmail = (String) userData.get("email");

      if (userEmail == null || userEmail.isEmpty()) {
        throw new JobGenieException("User email not found", "USER_EMAIL_NOT_FOUND");
      }

      String subject = "Job Application Submitted";
      String content =
          String.format(
              "Your application for %s at %s has been submitted successfully. "
                  + "We will notify you of any updates regarding your application.",
              jobTitle, companyName);

      return sendEmailNotification(userEmail, subject, content);
    } catch (JobGenieException e) {
      throw e;
    } catch (Exception e) {
      log.error("Failed to send job application notification to user: {}", userId, e);
      throw new JobGenieException(
          "Failed to send job application notification: " + e.getMessage(),
          "JOB_APPLICATION_NOTIFICATION_ERROR");
    }
  }

  @Override
  @SuppressWarnings("unchecked")
  public boolean sendGenericNotification(String userId, Map<String, Object> notificationData) {
    try {
      log.info("Sending generic notification to user: {}", userId);

      String type = (String) notificationData.get("type");
      String title = (String) notificationData.get("title");
      String message = (String) notificationData.get("message");

      if (title == null || message == null) {
        throw new JobGenieException("Title and message are required", "INVALID_NOTIFICATION_DATA");
      }

      switch (type != null ? type.toLowerCase() : "email") {
        case "sms":
          String phoneNumber = (String) notificationData.get("phoneNumber");
          if (phoneNumber == null) {
            throw new JobGenieException(
                "Phone number is required for SMS notifications", "MISSING_PHONE_NUMBER");
          }
          return sendSMSNotification(phoneNumber, message);

        case "push":
          return sendPushNotification(userId, title, message);

        case "email":
        default:
          String email = (String) notificationData.get("email");
          if (email == null) {
            // Try to get email from user service
            ResponseEntity<Map> userResponse =
                restTemplate.getForEntity(userServiceUrl + "/api/users/" + userId, Map.class);

            if (userResponse.getStatusCode().is2xxSuccessful() && userResponse.getBody() != null) {
              Map<String, Object> userData = userResponse.getBody();
              email = (String) userData.get("email");
            }
          }

          if (email == null || email.isEmpty()) {
            throw new JobGenieException("Email address not found", "EMAIL_NOT_FOUND");
          }
          return sendEmailNotification(email, title, message);
      }
    } catch (JobGenieException e) {
      throw e;
    } catch (Exception e) {
      log.error("Failed to send generic notification to user: {}", userId, e);
      throw new JobGenieException(
          "Failed to send generic notification: " + e.getMessage(), "GENERIC_NOTIFICATION_ERROR");
    }
  }
}
