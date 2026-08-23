package com.jobgenie.userservice.config;

import java.time.Duration;

import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

@Configuration
public class RestTemplateConfig {

  // Used for best-effort cross-service cleanup (resume-service, job-service) when a user
  // deletes their own account. Short timeouts because this is a handful of internal REST
  // calls, not a long-running scrape — a hung downstream service should not block deletion
  // of the primary user-service record for long.
  @Bean
  public RestTemplate restTemplate(RestTemplateBuilder builder) {
    RestTemplate restTemplate =
        builder
            .setConnectTimeout(Duration.ofSeconds(5))
            .setReadTimeout(Duration.ofSeconds(15))
            .build();
    // Same XML-converter hazard as job-service's RestTemplate: if jackson-dataformat-xml ends
    // up on the classpath transitively, Spring can silently serialize a raw Map/List body as
    // XML instead of JSON. This RestTemplate only ever talks JSON to internal services.
    restTemplate
        .getMessageConverters()
        .removeIf(converter -> converter.getClass().getName().contains("Xml"));
    return restTemplate;
  }
}
