package com.jobgenie.jobservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

@SpringBootApplication
@EnableDiscoveryClient
@EntityScan(basePackages = {"com.jobgenie.jobservice", "com.jobgenie.shared.entities"})
public class JobServiceApplication {

  public static void main(String[] args) {
    SpringApplication.run(JobServiceApplication.class, args);
  }
}
