package com.jobgenie.jobservice.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.jobgenie.shared.entities.SavedJob;

@Repository
public interface SavedJobRepository extends JpaRepository<SavedJob, Long> {

  List<SavedJob> findByUserIdOrderBySavedAtDesc(Long userId);

  Optional<SavedJob> findByUserIdAndJobId(Long userId, String jobId);

  boolean existsByUserIdAndJobId(Long userId, String jobId);

  void deleteByUserIdAndJobId(Long userId, String jobId);
}
