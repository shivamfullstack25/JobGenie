// Resume-based skill extraction service
export interface ExtractedSkills {
  technical: string[];
  soft: string[];
  tools: string[];
  languages: string[];
  frameworks: string[];
  databases: string[];
  cloud: string[];
}

export interface ResumeAnalysis {
  skills: ExtractedSkills;
  experience: string;
  jobTitles: string[];
  companies: string[];
  education: string[];
  certifications: string[];
}

// Comprehensive skill patterns for extraction
const skillPatterns = {
  technical: [
    // Programming Languages
    'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust', 'PHP', 'Ruby', 'Swift', 'Kotlin', 'Scala', 'R', 'MATLAB', 'SQL', 'HTML', 'CSS',
    
    // Web Technologies
    'React', 'Angular', 'Vue.js', 'Next.js', 'Nuxt.js', 'Express.js', 'Node.js', 'Django', 'Flask', 'Spring Boot', 'Laravel', 'Rails', 'ASP.NET',
    
    // Mobile Development
    'React Native', 'Flutter', 'iOS', 'Android', 'Xamarin', 'Ionic',
    
    // Databases
    'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Elasticsearch', 'Oracle', 'SQLite', 'Cassandra', 'DynamoDB', 'Neo4j',
    
    // Cloud & DevOps
    'AWS', 'Azure', 'Google Cloud', 'GCP', 'Docker', 'Kubernetes', 'Jenkins', 'GitLab', 'GitHub Actions', 'Terraform', 'Ansible',
    
    // Data & AI
    'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'Scikit-learn', 'Pandas', 'NumPy', 'Apache Spark', 'Hadoop', 'Kafka',
    
    // Testing & Quality
    'Jest', 'Cypress', 'Selenium', 'JUnit', 'TestNG', 'Mocha', 'Chai',
    
    // Tools & Platforms
    'Git', 'JIRA', 'Confluence', 'Slack', 'Figma', 'Adobe Creative Suite', 'Photoshop', 'Illustrator'
  ],
  
  soft: [
    'Leadership', 'Communication', 'Problem Solving', 'Team Management', 'Project Management', 'Agile', 'Scrum', 'Critical Thinking',
    'Analytical Skills', 'Collaboration', 'Adaptability', 'Time Management', 'Mentoring', 'Cross-functional', 'Strategic Planning'
  ],
  
  experience: [
    'Senior', 'Lead', 'Principal', 'Staff', 'Manager', 'Director', 'VP', 'CTO', 'Architect', 'Consultant', 'Specialist'
  ]
};

export const extractSkillsFromResume = async (resumeText: string): Promise<ResumeAnalysis> => {
  return extractSkillsWithPatterns(resumeText);
};

const extractSkillsWithPatterns = (text: string): ResumeAnalysis => {
  const textLower = text.toLowerCase();
  const words = text.split(/\s+/);
  
  const extractedSkills: ExtractedSkills = {
    technical: [],
    soft: [],
    tools: [],
    languages: [],
    frameworks: [],
    databases: [],
    cloud: []
  };

  // Extract technical skills
  skillPatterns.technical.forEach(skill => {
    const skillLower = skill.toLowerCase();
    if (textLower.includes(skillLower) || 
        words.some(word => word.toLowerCase().includes(skillLower))) {
      
      // Categorize skills
      if (['JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust', 'PHP', 'Ruby', 'Swift', 'Kotlin'].includes(skill)) {
        extractedSkills.languages.push(skill);
      } else if (['React', 'Angular', 'Vue.js', 'Next.js', 'Django', 'Flask', 'Spring Boot'].includes(skill)) {
        extractedSkills.frameworks.push(skill);
      } else if (['MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Elasticsearch'].includes(skill)) {
        extractedSkills.databases.push(skill);
      } else if (['AWS', 'Azure', 'Google Cloud', 'GCP', 'Docker', 'Kubernetes'].includes(skill)) {
        extractedSkills.cloud.push(skill);
      } else {
        extractedSkills.technical.push(skill);
      }
    }
  });

  // Extract soft skills
  skillPatterns.soft.forEach(skill => {
    if (textLower.includes(skill.toLowerCase())) {
      extractedSkills.soft.push(skill);
    }
  });

  // Extract experience level and job titles
  const jobTitles = extractJobTitles(text);
  const companies = extractCompanies(text);
  const education = extractEducation(text);
  const certifications = extractCertifications(text);
  const experience = determineExperienceLevel(text, jobTitles);

  return {
    skills: extractedSkills,
    experience,
    jobTitles,
    companies,
    education,
    certifications
  };
};

const extractJobTitles = (text: string): string[] => {
  const titlePatterns = [
    /(?:Software|Senior|Lead|Principal|Staff)\s+(?:Engineer|Developer|Architect)/gi,
    /(?:Full Stack|Frontend|Backend|Mobile)\s+Developer/gi,
    /(?:Product|Project|Engineering)\s+Manager/gi,
    /(?:Data|ML|AI)\s+(?:Scientist|Engineer)/gi,
    /(?:DevOps|Cloud|Platform)\s+Engineer/gi,
    /(?:UI\/UX|UX|UI)\s+Designer/gi
  ];

  const titles: string[] = [];
  titlePatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      titles.push(...matches);
    }
  });

  return Array.from(new Set(titles)); // Remove duplicates
};

const extractCompanies = (text: string): string[] => {
  // Common company indicators
  const companyPatterns = [
    /(?:at|@)\s+([A-Z][a-zA-Z\s&]+(?:Inc|LLC|Ltd|Corp|Company|Technologies|Systems|Solutions))/g,
    /(?:worked at|employed by|position at)\s+([A-Z][a-zA-Z\s&]+)/gi
  ];

  const companies: string[] = [];
  companyPatterns.forEach(pattern => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach(match => {
      if (match[1]) {
        companies.push(match[1].trim());
      }
    });
  });

  return [...new Set(companies)];
};

const extractEducation = (text: string): string[] => {
  const educationPatterns = [
    /(?:Bachelor|Master|PhD|B\.S\.|M\.S\.|B\.Tech|M\.Tech|MBA).*?(?:in|of)\s+([A-Za-z\s]+)/gi,
    /(?:Computer Science|Software Engineering|Information Technology|Engineering|Mathematics|Statistics)/gi
  ];

  const education: string[] = [];
  educationPatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      education.push(...matches);
    }
  });

  return [...new Set(education)];
};

const extractCertifications = (text: string): string[] => {
  const certPatterns = [
    /(?:AWS|Azure|Google Cloud|GCP)\s+(?:Certified|Certificate)/gi,
    /(?:PMP|Scrum Master|CSM|CISSP|CISM)/gi,
    /(?:Oracle|Microsoft|Salesforce|MongoDB)\s+Certified/gi
  ];

  const certifications: string[] = [];
  certPatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      certifications.push(...matches);
    }
  });

  return [...new Set(certifications)];
};

const determineExperienceLevel = (text: string, jobTitles: string[]): string => {
  const textLower = text.toLowerCase();
  
  // Check for years of experience
  const yearMatches = text.match(/(\d+)\+?\s*years?\s*(?:of\s*)?experience/gi);
  if (yearMatches) {
    const years = Math.max(...yearMatches.map(match => parseInt(match.match(/\d+/)?.[0] || '0')));
    if (years >= 8) return 'Senior Level (8+ years)';
    if (years >= 5) return 'Mid Level (5-7 years)';
    if (years >= 2) return 'Junior Level (2-4 years)';
    return 'Entry Level (0-2 years)';
  }

  // Check job titles for seniority
  const seniorityKeywords = jobTitles.join(' ').toLowerCase();
  if (seniorityKeywords.includes('principal') || seniorityKeywords.includes('staff') || seniorityKeywords.includes('architect')) {
    return 'Senior Level (8+ years)';
  }
  if (seniorityKeywords.includes('senior') || seniorityKeywords.includes('lead')) {
    return 'Mid to Senior Level (5+ years)';
  }
  if (seniorityKeywords.includes('junior') || textLower.includes('entry level') || textLower.includes('graduate')) {
    return 'Entry to Junior Level (0-3 years)';
  }

  // Default to mid-level if unclear
  return 'Mid Level (3-5 years)';
};

export const formatSkillsForJobSearch = (analysis: ResumeAnalysis): string => {
  const allSkills = [
    ...analysis.skills.languages,
    ...analysis.skills.frameworks,
    ...analysis.skills.technical,
    ...analysis.skills.tools,
    ...analysis.skills.databases,
    ...analysis.skills.cloud
  ];

  // Return top 15 most relevant skills
  return allSkills.slice(0, 15).join(', ');
};