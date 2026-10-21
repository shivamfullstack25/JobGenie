package com.jobgenie.jobservice.tracking;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ApplicationTransitionRepository extends JpaRepository<ApplicationTransition, Long> {
  List<ApplicationTransition> findByApplicationIdOrderByCreatedAtAscIdAsc(Long applicationId);
}
