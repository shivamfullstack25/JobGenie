package com.jobgenie.jobservice.config;

import java.time.Duration;

import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

@Configuration
public class RestTemplateConfig {

  // A hung downstream call (resume-service, AI service) would otherwise block the calling
  // thread forever — no timeout was previously set anywhere. Read timeout is generous
  // because live job-search scraping through the AI service can legitimately take 15-30s.
  @Bean
  public RestTemplate restTemplate(RestTemplateBuilder builder) {
    RestTemplate restTemplate =
        builder
            .setConnectTimeout(Duration.ofSeconds(10))
            .setReadTimeout(Duration.ofSeconds(45))
            .build();
    // If jackson-dataformat-xml is on the classpath (transitively, e.g. via springdoc),
    // Spring auto-registers an XML message converter that can win converter selection for a
    // raw Map body when no Content-Type is set — silently serializing calls to the AI
    // service (which only accepts JSON) as XML and breaking them. Drop it; this
    // RestTemplate is only ever used to talk JSON to internal services.
    restTemplate
        .getMessageConverters()
        .removeIf(converter -> converter.getClass().getName().contains("Xml"));
    return restTemplate;
  }
}
