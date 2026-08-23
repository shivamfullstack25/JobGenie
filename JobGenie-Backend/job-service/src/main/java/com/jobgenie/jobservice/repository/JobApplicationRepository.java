package com.jobgenie.jobservice.repository;

import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.jobgenie.shared.entities.JobApplication;

@Repository
public interface JobApplicationRepository extends JpaRepository<JobApplication, Long> {

  /** Find all job applications for a specific user */
  Page<JobApplication> findByUserId(String userId, Pageable pageable);

  /** Find job applications by user ID and status */
  List<JobApplication> findByUserIdAndStatus(String userId, String status);

  /** Find job application by user ID and job ID */
  JobApplication findByUserIdAndJobId(String userId, String jobId);

  /** Check if user has already applied to a job */
  boolean existsByUserIdAndJobId(String userId, String jobId);
}
