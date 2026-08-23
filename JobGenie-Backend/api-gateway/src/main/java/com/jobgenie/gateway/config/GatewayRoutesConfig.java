package com.jobgenie.gateway.config;

import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.cloud.gateway.route.builder.RouteLocatorBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;

@Configuration
public class GatewayRoutesConfig {

  @Bean
  public RouteLocator customRouteLocator(RouteLocatorBuilder builder) {
    return builder
        .routes()
        // ==================================================
        // AUTH — Firebase endpoints proxied to user-service.
        // LinkedIn OAuth (/api/auth/linkedin*) is handled by the local gateway AuthController.
        // ==================================================
        .route(
            "auth-verify",
            r -> r.path("/api/auth/verify").and().method(HttpMethod.POST).uri("lb://user-service"))
        .route(
            "auth-refresh",
            r -> r.path("/api/auth/refresh").and().method(HttpMethod.POST).uri("lb://user-service"))
        .route(
            "auth-logout",
            r -> r.path("/api/auth/logout").and().method(HttpMethod.POST).uri("lb://user-service"))
        .route(
            "auth-me",
            r -> r.path("/api/auth/me").and().method(HttpMethod.GET).uri("lb://user-service"))
        .route(
            "auth-health",
            r -> r.path("/api/auth/health").and().method(HttpMethod.GET).uri("lb://user-service"))

        // ==================================================
        // AI SERVICE — specific routes BEFORE broader /api/jobs/** catch-all
        // ==================================================
        .route(
            "ai-search-and-apply",
            r ->
                r.path("/api/jobs/search-and-apply")
                    .and()
                    .method(HttpMethod.POST)
                    .uri("lb://ai-service"))
        .route(
            "ai-advanced-auto-apply",
            r ->
                r.path("/api/advanced-auto-apply")
                    .and()
                    .method(HttpMethod.POST)
                    .uri("lb://ai-service"))
        .route(
            "ai-auto-apply-batch",
            r ->
                r.path("/api/auto-apply/batch")
                    .and()
                    .method(HttpMethod.POST)
                    .uri("lb://ai-service"))
        .route(
            "ai-auto-apply-linkedin",
            r ->
                r.path("/api/auto-apply/linkedin")
                    .and()
                    .method(HttpMethod.POST)
                    .uri("lb://ai-service"))
        .route(
            "ai-auto-apply-indeed",
            r ->
                r.path("/api/auto-apply/indeed")
                    .and()
                    .method(HttpMethod.POST)
                    .uri("lb://ai-service"))
        .route(
            "ai-auto-apply-naukri",
            r ->
                r.path("/api/auto-apply/naukri")
                    .and()
                    .method(HttpMethod.POST)
                    .uri("lb://ai-service"))
        .route(
            "ai-schedule-job-search",
            r ->
                r.path("/api/schedule/job-search")
                    .and()
                    .method(HttpMethod.POST)
                    .uri("lb://ai-service"))
        .route(
            "ai-schedule-auto-apply",
            r ->
                r.path("/api/schedule/auto-apply")
                    .and()
                    .method(HttpMethod.POST)
                    .uri("lb://ai-service"))
        .route(
            "ai-schedule-user",
            r ->
                r.path("/api/schedule/user/**").and().method(HttpMethod.GET).uri("lb://ai-service"))
        .route(
            "ai-schedule-pause",
            r ->
                r.path("/api/schedule/*/pause")
                    .and()
                    .method(HttpMethod.POST)
                    .uri("lb://ai-service"))
        .route(
            "ai-schedule-resume",
            r ->
                r.path("/api/schedule/*/resume")
                    .and()
                    .method(HttpMethod.POST)
                    .uri("lb://ai-service"))
        .route(
            "ai-schedule-delete",
            r -> r.path("/api/schedule/**").and().method(HttpMethod.DELETE).uri("lb://ai-service"))
        .route(
            "ai-schedule-stats",
            r -> r.path("/api/schedule/stats").and().method(HttpMethod.GET).uri("lb://ai-service"))
        .route(
            "ai-notifications-send",
            r ->
                r.path("/api/notifications/send")
                    .and()
                    .method(HttpMethod.POST)
                    .uri("lb://ai-service"))
        .route(
            "ai-notifications-history",
            r ->
                r.path("/api/notifications/history/**")
                    .and()
                    .method(HttpMethod.GET)
                    .uri("lb://ai-service"))
        .route(
            "ai-notifications-read",
            r ->
                r.path("/api/notifications/*/read")
                    .and()
                    .method(HttpMethod.POST)
                    .uri("lb://ai-service"))
        .route(
            "ai-notifications-stats",
            r ->
                r.path("/api/notifications/stats/**")
                    .and()
                    .method(HttpMethod.GET)
                    .uri("lb://ai-service"))
        .route(
            "ai-notifications-webhook",
            r ->
                r.path("/api/notifications/webhook")
                    .and()
                    .method(HttpMethod.POST)
                    .uri("lb://ai-service"))
        .route(
            "ai-market-intelligence",
            r -> r.path("/api/market-intelligence/**").uri("lb://ai-service"))
        .route("ai-job-aggregator", r -> r.path("/api/job-aggregator/**").uri("lb://ai-service"))
        .route("ai-career-mentor", r -> r.path("/api/career-mentor/**").uri("lb://ai-service"))
        .route("ai-service-core", r -> r.path("/ai/**").uri("lb://ai-service"))
        .route("ai-service-direct", r -> r.path("/api/ai/**").uri("lb://ai-service"))
        .route(
            "ai-websocket-notifications",
            r -> r.path("/ws/notifications/**").uri("lb://ai-service"))

        // ==================================================
        // JOB SERVICE — automation & schedules (separate from /api/jobs/**)
        // ==================================================
        .route("automation-service", r -> r.path("/api/automation/**").uri("lb://job-service"))
        .route("schedules-service", r -> r.path("/api/schedules/**").uri("lb://job-service"))

        // ==================================================
        // NOTIFICATION SERVICE — email/SMS/push (distinct from AI in-app notifications)
        // ==================================================
        .route(
            "notification-email",
            r -> r.path("/api/notifications/email").uri("lb://notification-service"))
        .route(
            "notification-sms",
            r -> r.path("/api/notifications/sms").uri("lb://notification-service"))
        .route(
            "notification-push",
            r -> r.path("/api/notifications/push").uri("lb://notification-service"))
        .route(
            "notification-job-application",
            r -> r.path("/api/notifications/job-application").uri("lb://notification-service"))
        .route(
            "notification-generic",
            r -> r.path("/api/notifications/generic").uri("lb://notification-service"))
        .route(
            "notification-health",
            r -> r.path("/api/notifications/health").uri("lb://notification-service"))

        // ==================================================
        // CORE MICROSERVICE ROUTES
        // ==================================================
        .route("user-service", r -> r.path("/api/users/**").uri("lb://user-service"))
        // Frontend aliases → user-service
        .route("preferences-alias", r -> r.path("/api/preferences/**").uri("lb://user-service"))
        .route("profile-alias", r -> r.path("/api/profile/**").uri("lb://user-service"))
        .route("resume-service", r -> r.path("/api/resumes/**").uri("lb://resume-service"))
        .route("job-service", r -> r.path("/api/jobs/**").uri("lb://job-service"))

        // ==================================================
        // GATEWAY-LOCAL ROUTES (admin, analytics, gateway stats)
        // ==================================================
        .route("admin-gateway", r -> r.path("/api/admin/**").uri("lb://api-gateway"))
        .route("gateway-health", r -> r.path("/api/gateway/**").uri("lb://api-gateway"))
        .build();
  }
}
