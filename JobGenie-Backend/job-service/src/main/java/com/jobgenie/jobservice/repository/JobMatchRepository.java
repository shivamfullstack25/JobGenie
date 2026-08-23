package com.jobgenie.jobservice.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.jobgenie.shared.entities.JobMatch;

@Repository
public interface JobMatchRepository extends JpaRepository<JobMatch, Long> {

  List<JobMatch> findByUserIdOrderByCreatedAtDesc(Long userId);

  List<JobMatch> findByUserIdAndResumeIdOrderByMatchScoreDesc(Long userId, Long resumeId);

  long countByUserId(Long userId);
}
