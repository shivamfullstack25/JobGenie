package com.jobgenie.resumeservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

@SpringBootApplication
@EnableDiscoveryClient
@EntityScan(basePackages = {"com.jobgenie.resumeservice", "com.jobgenie.shared.entities"})
public class ResumeServiceApplication {

  public static void main(String[] args) {
    SpringApplication.run(ResumeServiceApplication.class, args);
  }
}
