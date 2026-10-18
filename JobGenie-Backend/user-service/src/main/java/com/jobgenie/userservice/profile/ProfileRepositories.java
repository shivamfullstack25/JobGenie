package com.jobgenie.userservice.profile;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

public final class ProfileRepositories {
  private ProfileRepositories() {}

  @Repository
  public interface Profiles extends JpaRepository<CandidateProfile, Long> {
    Optional<CandidateProfile> findByUserId(Long userId);

    void deleteByUserId(Long userId);
  }

  @Repository
  public interface Versions extends JpaRepository<ProfileVersion, Long> {
    List<ProfileVersion> findByUserIdOrderByVersionDesc(Long userId);

    Optional<ProfileVersion> findByUserIdAndVersion(Long userId, int version);

    void deleteByUserId(Long userId);
  }

  @Repository
  public interface Proposals extends JpaRepository<ProfileProposal, Long> {
    List<ProfileProposal> findByUserIdAndStatusOrderByCreatedAtDesc(
        Long userId, ProfileProposal.Status status);

    void deleteByUserId(Long userId);
  }
}
