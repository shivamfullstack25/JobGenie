package com.jobgenie.resumeservice.service;

import java.util.List;
import java.util.Map;

import org.springframework.web.multipart.MultipartFile;

import com.jobgenie.resumeservice.dto.ResumeUploadResponse;
import com.jobgenie.shared.dto.ResumeDto;

public interface ResumeService {

  ResumeUploadResponse uploadAndProcessResume(MultipartFile file, Long userId);

  List<ResumeDto> getUserResumes(Long userId);

  ResumeDto getResume(Long resumeId);

  boolean deleteResume(Long resumeId);

  boolean activateResume(Long resumeId);

  String getResumeContent(Long resumeId);

  void updateParsedResumeData(Long userId, Map<String, Object> parsedData);

  long getResumeCount();
}
