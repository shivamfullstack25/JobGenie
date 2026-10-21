package com.jobgenie.userservice.profile;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ProfileVersionRepository extends JpaRepository<ProfileVersion, Long> {
  List<ProfileVersion> findByUserIdOrderByVersionDesc(Long userId);

  Optional<ProfileVersion> findByUserIdAndVersion(Long userId, int version);

  void deleteByUserId(Long userId);
}
