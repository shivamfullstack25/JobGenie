package com.jobgenie.resumeservice.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.jobgenie.shared.entities.Resume;

@Repository
public interface ResumeRepository extends JpaRepository<Resume, Long> {

  List<Resume> findByUserIdAndIsActiveTrue(Long userId);

  List<Resume> findByUserId(Long userId);

  List<Resume> findByIsActiveTrue();
}
