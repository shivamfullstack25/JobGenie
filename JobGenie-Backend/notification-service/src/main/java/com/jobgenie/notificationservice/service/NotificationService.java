package com.jobgenie.notificationservice.service;

import java.util.Map;

public interface NotificationService {

  /**
   * Send email notification
   *
   * @param to Recipient email address
   * @param subject Email subject
   * @param content Email content
   * @return Success status
   */
  boolean sendEmailNotification(String to, String subject, String content);

  /**
   * Send SMS notification
   *
   * @param phoneNumber Recipient phone number
   * @param message SMS message
   * @return Success status
   */
  boolean sendSMSNotification(String phoneNumber, String message);

  /**
   * Send push notification
   *
   * @param userId User ID
   * @param title Notification title
   * @param message Notification message
   * @return Success status
   */
  boolean sendPushNotification(String userId, String title, String message);

  /**
   * Send job application notification
   *
   * @param userId User ID
   * @param jobTitle Job title
   * @param companyName Company name
   * @return Success status
   */
  boolean sendJobApplicationNotification(String userId, String jobTitle, String companyName);

  /**
   * Send generic notification
   *
   * @param userId User ID
   * @param notificationData Notification data
   * @return Success status
   */
  boolean sendGenericNotification(String userId, Map<String, Object> notificationData);
}
