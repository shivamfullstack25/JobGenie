package com.jobgenie.gateway.controller;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ServerWebExchange;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Mono;

@Slf4j
@RestController
@RequestMapping("/api/auth")
@Tag(name = "Authentication", description = "Authentication and authorization endpoints")
public class AuthController {

  @Value("${USER_SERVICE_URL:http://user-service:8081}")
  private String userServiceUrl;

  @GetMapping("/linkedin")
  @Operation(
      summary = "Redirect to LinkedIn OAuth",
      description = "Initiates the LinkedIn OAuth flow.")
  public Mono<Void> redirectToLinkedIn(
      ServerWebExchange exchange, @RequestParam("userId") String userId) {
    log.info("Starting LinkedIn OAuth for userId={}", userId);
    String rawClientId = System.getenv("LINKEDIN_CLIENT_ID");
    String rawRedirectUri = System.getenv("LINKEDIN_REDIRECT_URI");
    // LINKEDIN_CLIENT_ID/LINKEDIN_REDIRECT_URI aren't configured in this deployment's env —
    // previously this NPE'd inside URLEncoder.encode(null, ...) and surfaced as an opaque
    // 500 with no explanation. Fail gracefully with a clear message instead.
    if (rawClientId == null
        || rawClientId.isBlank()
        || rawRedirectUri == null
        || rawRedirectUri.isBlank()) {
      log.warn(
          "LinkedIn OAuth requested but LINKEDIN_CLIENT_ID/LINKEDIN_REDIRECT_URI not configured");
      ServerHttpResponse unconfiguredResponse = exchange.getResponse();
      unconfiguredResponse.setStatusCode(HttpStatus.SERVICE_UNAVAILABLE);
      unconfiguredResponse.getHeaders().setContentType(MediaType.APPLICATION_JSON);
      byte[] body =
          "{\"error\":\"LinkedIn integration is not configured on this server\"}"
              .getBytes(StandardCharsets.UTF_8);
      return unconfiguredResponse.writeWith(
          Mono.just(unconfiguredResponse.bufferFactory().wrap(body)));
    }
    String clientId = rawClientId;
    String redirectUri = URLEncoder.encode(rawRedirectUri, StandardCharsets.UTF_8);
    String state = UUID.randomUUID().toString();
    String scope = "r_liteprofile r_emailaddress";
    String url =
        "https://www.linkedin.com/oauth/v2/authorization?response_type=code"
            + "&client_id="
            + clientId
            + "&redirect_uri="
            + redirectUri
            + "&state="
            + state
            + "&scope="
            + scope;

    ServerHttpResponse response = exchange.getResponse();
    response.setStatusCode(HttpStatus.FOUND);
    response.getHeaders().setLocation(URI.create(url));
    return response.setComplete();
  }

  @GetMapping("/linkedin/callback")
  @Operation(
      summary = "Handle LinkedIn OAuth callback",
      description = "Processes the callback from LinkedIn OAuth.")
  public ResponseEntity<?> handleLinkedInCallback(
      @RequestParam("code") String code,
      @RequestParam("state") String state,
      @RequestParam("userId") String userId) {
    log.info("Handling LinkedIn OAuth callback for userId={}, state={}", userId, state);
    try {
      String clientId = System.getenv("LINKEDIN_CLIENT_ID");
      String clientSecret = System.getenv("LINKEDIN_CLIENT_SECRET");
      String redirectUri = System.getenv("LINKEDIN_REDIRECT_URI");

      if (clientId == null || clientSecret == null || redirectUri == null) {
        log.warn("LinkedIn OAuth callback received but LinkedIn credentials are not configured");
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
            .body(Map.of("error", "LinkedIn integration is not configured on this server"));
      }

      RestTemplate restTemplate = new RestTemplate();
      HttpHeaders headers = new HttpHeaders();
      headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

      MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
      params.add("grant_type", "authorization_code");
      params.add("code", code);
      params.add("redirect_uri", redirectUri);
      params.add("client_id", clientId);
      params.add("client_secret", clientSecret);

      HttpEntity<MultiValueMap<String, String>> request = new HttpEntity<>(params, headers);
      ResponseEntity<Map> response =
          restTemplate.postForEntity(
              "https://www.linkedin.com/oauth/v2/accessToken", request, Map.class);

      String accessToken = (String) response.getBody().get("access_token");

      HttpHeaders authHeaders = new HttpHeaders();
      authHeaders.setBearerAuth(accessToken);
      HttpEntity<String> profileRequest = new HttpEntity<>(authHeaders);

      ResponseEntity<Map> profileResponse =
          restTemplate.exchange(
              "https://api.linkedin.com/v2/me", HttpMethod.GET, profileRequest, Map.class);
      ResponseEntity<Map> emailResponse =
          restTemplate.exchange(
              "https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))",
              HttpMethod.GET,
              profileRequest,
              Map.class);

      Map profileData = profileResponse.getBody();
      Map emailData = emailResponse.getBody();

      String firstName =
          ((Map) ((Map) profileData.get("firstName")).get("localized"))
              .values()
              .iterator()
              .next()
              .toString();
      String lastName =
          ((Map) ((Map) profileData.get("lastName")).get("localized"))
              .values()
              .iterator()
              .next()
              .toString();
      String name = firstName + " " + lastName;
      String linkedinId = (String) profileData.get("id");
      String linkedinUrl = "https://www.linkedin.com/in/" + linkedinId;
      String email =
          (String)
              ((Map) ((Map) ((List) emailData.get("elements")).get(0)).get("handle~"))
                  .get("emailAddress");

      Map<String, Object> updateRequest =
          Map.of(
              "name", name,
              "email", email,
              "linkedinUrl", linkedinUrl);

      HttpHeaders userHeaders = new HttpHeaders();
      userHeaders.setContentType(MediaType.APPLICATION_JSON);
      HttpEntity<Map<String, Object>> userReq = new HttpEntity<>(updateRequest, userHeaders);
      String url = userServiceUrl + "/api/users/profile?userId=" + userId;
      restTemplate.put(url, userReq);

      log.info("LinkedIn profile data fetched and user profile updated for userId={}", userId);
      return ResponseEntity.ok(
          Map.of(
              "profile", profileData,
              "email", emailData));
    } catch (Exception e) {
      log.error("LinkedIn OAuth failed for userId={}: {}", userId, e.getMessage(), e);
      return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
    }
  }
}
