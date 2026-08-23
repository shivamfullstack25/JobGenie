package com.jobgenie.resumeservice.util;

import java.io.IOException;
import java.io.InputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

@Component
public class FileProcessor {

  public String extractText(MultipartFile file) {
    try {
      String contentType = file.getContentType();
      if (contentType == null) {
        return null;
      }

      if (contentType.equals("application/pdf")) {
        return extractTextFromPDF(file.getInputStream());
      } else if (contentType.equals(
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document")) {
        return extractTextFromDocx(file.getInputStream());
      } else if (contentType.equals("application/msword")) {
        return extractTextFromDoc(file.getInputStream());
      } else if (contentType.equals("text/plain")) {
        return new String(file.getBytes());
      } else {
        throw new UnsupportedOperationException("Unsupported file type: " + contentType);
      }
    } catch (Exception e) {
      throw new RuntimeException("Error extracting text from file", e);
    }
  }

  private String extractTextFromPDF(InputStream inputStream) throws IOException {
    try (PDDocument document = PDDocument.load(inputStream)) {
      PDFTextStripper stripper = new PDFTextStripper();
      return stripper.getText(document);
    }
  }

  private String extractTextFromDocx(InputStream inputStream) throws IOException {
    try (XWPFDocument document = new XWPFDocument(inputStream)) {
      StringBuilder text = new StringBuilder();
      for (XWPFParagraph paragraph : document.getParagraphs()) {
        text.append(paragraph.getText()).append("\n");
      }
      return text.toString();
    }
  }

  private String extractTextFromDoc(InputStream inputStream) throws IOException {
    // For .doc files, we would need Apache POI's HWPF
    // For simplicity, we'll throw an exception
    throw new UnsupportedOperationException(
        "DOC files are not supported yet. Please convert to DOCX or PDF.");
  }
}
