package com.jobgenie.userservice.profile;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ProfileProposalRepository extends JpaRepository<ProfileProposal, Long> {
  List<ProfileProposal> findByUserIdAndStatusOrderByCreatedAtDesc(
      Long userId, ProfileProposal.Status status);

  void deleteByUserId(Long userId);
}
