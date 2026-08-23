package com.jobgenie.gateway.config;

import java.util.List;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.config.EnableWebFlux;
import org.springframework.web.reactive.config.WebFluxConfigurer;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.servers.Server;

@Configuration
@EnableWebFlux
public class SwaggerConfig implements WebFluxConfigurer {

  @Bean
  public OpenAPI gatewayOpenAPI() {
    return new OpenAPI()
        .info(
            new Info()
                .title("JobGenie API Gateway")
                .description(
                    "API Gateway for JobGenie Microservices - Routes requests to appropriate services")
                .version("1.0.0")
                .contact(
                    new Contact()
                        .name("JobGenie Team")
                        .email("support@jobgenie.com")
                        .url("https://jobgenie.com"))
                .license(
                    new License().name("MIT License").url("https://opensource.org/licenses/MIT")))
        .servers(
            List.of(
                new Server().url("http://localhost:8080").description("Local Development Server"),
                new Server().url("https://api.jobgenie.com").description("Production Server")));
  }
}
