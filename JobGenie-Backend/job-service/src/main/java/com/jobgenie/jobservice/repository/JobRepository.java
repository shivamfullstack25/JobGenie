package com.jobgenie.jobservice.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.jobgenie.shared.entities.Job;

@Repository
public interface JobRepository extends JpaRepository<Job, Long> {

  /** Find job by external job ID */
  Optional<Job> findByJobId(String jobId);

  /** Find jobs by company name */
  List<Job> findByCompanyContainingIgnoreCase(String company);

  /** Find jobs by location */
  List<Job> findByLocationContainingIgnoreCase(String location);

  /** Find jobs by job type */
  List<Job> findByType(String type);

  /** Find remote jobs */
  List<Job> findByIsRemoteTrue();

  /** Check if job exists by external job ID */
  boolean existsByJobId(String jobId);
}
