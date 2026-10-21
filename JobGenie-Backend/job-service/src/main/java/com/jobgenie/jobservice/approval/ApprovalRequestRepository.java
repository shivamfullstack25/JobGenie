package com.jobgenie.jobservice.approval;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ApprovalRequestRepository extends JpaRepository<ApprovalRequest, Long> {
  List<ApprovalRequest> findByUserIdAndStatusOrderByCreatedAtDesc(
      String userId, ApprovalRequest.Status status);

  List<ApprovalRequest> findByUserIdOrderByCreatedAtDesc(String userId);

  Optional<ApprovalRequest> findFirstByUserIdAndJobIdAndStatusIn(
      String userId, String jobId, java.util.Collection<ApprovalRequest.Status> statuses);
}
