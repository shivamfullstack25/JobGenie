package com.jobgenie.userservice.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.jobgenie.shared.entities.User;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
  // Basic CRUD operations are inherited from JpaRepository

  Optional<User> findByFirebaseUid(String firebaseUid);

  Optional<User> findByEmail(String email);

  boolean existsByFirebaseUid(String firebaseUid);

  boolean existsByEmail(String email);
}
