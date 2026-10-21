import {Button} from "@/components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Link} from "wouter";
import shivamPhoto from "../assets/ShivamKumar_1751151888724.jpg";
import {Award, Bot, Brain, Clock, FileText, Lightbulb, Linkedin, Mail, MapPin, Phone, Rocket, Search, Settings, Shield, Target, TrendingUp, Users, Zap} from "lucide-react";

export default function About() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 bg-blue-100 dark:bg-blue-900 rounded-full">
            <Bot className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <span className="text-blue-700 dark:text-blue-300 font-medium">AI-Powered Career Intelligence</span>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
            Revolutionizing
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              {" "}Job Search
            </span>
          </h1>
          
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto leading-relaxed">
            JobGenie combines cutting-edge AI technology with intelligent automation to transform 
            how professionals find and secure their dream careers. Our multi-agent system works 
            24/7 to optimize your job search success.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/">
              <Button size="lg" className="px-8 py-3">
                <Rocket className="mr-2 h-5 w-5" />
                Start Your Journey
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="py-16 px-4 bg-white dark:bg-gray-800">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Our Mission
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Empowering job seekers with AI-driven insights and automation to achieve career success faster and more efficiently than ever before.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-6 w-6 text-blue-600" />
                  Our Vision
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 dark:text-gray-300">
                  To create a world where finding the perfect job is effortless, intelligent, and personalized. 
                  We envision a future where AI agents work as your personal career assistants, understanding 
                  your goals and automatically connecting you with opportunities that match your aspirations.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="h-6 w-6 text-purple-600" />
                  Our Innovation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 dark:text-gray-300">
                  JobGenie pioneers the use of multi-agent AI systems in career development. Our specialized 
                  AI agents collaborate to research companies, optimize resumes, craft cover letters, and 
                  strategize applications - all while learning from your preferences and improving over time.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Comprehensive Capabilities */}
      <section className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Everything You Need to Succeed
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              Comprehensive AI-powered tools for every step of your job search journey
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Smart Resume Analysis */}
            <Card className="border-blue-200 dark:border-blue-800 hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mb-3">
                  <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle className="text-lg">Smart Resume Analysis</CardTitle>
                <CardDescription>
                  AI extracts and optimizes your key information with skill identification, 
                  ATS scoring, and missing keyword detection for maximum impact.
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Multi-Platform Job Search */}
            <Card className="border-emerald-200 dark:border-emerald-800 hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900 rounded-lg flex items-center justify-center mb-3">
                  <Search className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <CardTitle className="text-lg">Multi-Platform Job Search</CardTitle>
                <CardDescription>
                  Simultaneously search across LinkedIn, Indeed, Naukri, and Glassdoor 
                  with real-time results and fresh posting notifications.
                </CardDescription>
              </CardHeader>
            </Card>

            {/* AI Job Matching */}
            <Card className="border-green-200 dark:border-green-800 hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mb-3">
                  <Target className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <CardTitle className="text-lg">Intelligent Job Matching</CardTitle>
                <CardDescription>
                  Advanced algorithms analyze job descriptions and match them with your 
                  profile, providing compatibility scores and salary insights.
                </CardDescription>
              </CardHeader>
            </Card>

            {/* ATS Resume Generator */}
            <Card className="border-purple-200 dark:border-purple-800 hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center mb-3">
                  <Award className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <CardTitle className="text-lg">ATS Resume Generator</CardTitle>
                <CardDescription>
                  Create job-specific optimized resumes with keyword integration, 
                  formatting optimization, and multi-format downloads (DOC, DOCX, PDF, TXT).
                </CardDescription>
              </CardHeader>
            </Card>

            {/* AI Cover Letters */}
            <Card className="border-orange-200 dark:border-orange-800 hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900 rounded-lg flex items-center justify-center mb-3">
                  <Mail className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <CardTitle className="text-lg">AI Cover Letter Generation</CardTitle>
                <CardDescription>
                  Personalized cover letters tailored to each job application with 
                  company research and role-specific customization.
                </CardDescription>
              </CardHeader>
            </Card>

            {/* 24/7 Automation */}
            <Card className="border-red-200 dark:border-red-800 hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-red-100 dark:bg-red-900 rounded-lg flex items-center justify-center mb-3">
                  <Clock className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <CardTitle className="text-lg">24/7 Job Automation</CardTitle>
                <CardDescription>
                  Continuous job searching and automated applications with scheduling, 
                  browser automation, and multi-platform integration.
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Market Intelligence */}
            <Card className="border-indigo-200 dark:border-indigo-800 hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900 rounded-lg flex items-center justify-center mb-3">
                  <TrendingUp className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <CardTitle className="text-lg">Market Intelligence</CardTitle>
                <CardDescription>
                  Real-time salary insights, industry trends, skills gap analysis, 
                  and market growth data for informed career decisions.
                </CardDescription>
              </CardHeader>
            </Card>

            {/* AI Career Mentor */}
            <Card className="border-pink-200 dark:border-pink-800 hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-pink-100 dark:bg-pink-900 rounded-lg flex items-center justify-center mb-3">
                  <Users className="h-6 w-6 text-pink-600 dark:text-pink-400" />
                </div>
                <CardTitle className="text-lg">AI Career Mentor</CardTitle>
                <CardDescription>
                  Personalized career guidance with roadmap planning, interview preparation, 
                  goal setting, and strategic career development advice.
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Multi-Agent AI System */}
            <Card className="border-violet-200 dark:border-violet-800 hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-violet-100 dark:bg-violet-900 rounded-lg flex items-center justify-center mb-3">
                  <Bot className="h-6 w-6 text-violet-600 dark:text-violet-400" />
                </div>
                <CardTitle className="text-lg">Multi-Agent AI System</CardTitle>
                <CardDescription>
                  Specialized AI agents collaborate on research, optimization, writing, 
                  coaching, and strategy with CrewAI orchestration.
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Smart AI Routing */}
            <Card className="border-cyan-200 dark:border-cyan-800 hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-cyan-100 dark:bg-cyan-900 rounded-lg flex items-center justify-center mb-3">
                  <Zap className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
                </div>
                <CardTitle className="text-lg">Cost-Optimized AI</CardTitle>
                <CardDescription>
                  Intelligent task distribution between local and cloud AI models 
                  achieving 60-80% cost reduction while maintaining quality.
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Workflow Orchestration */}
            <Card className="border-teal-200 dark:border-teal-800 hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-teal-100 dark:bg-teal-900 rounded-lg flex items-center justify-center mb-3">
                  <Settings className="h-6 w-6 text-teal-600 dark:text-teal-400" />
                </div>
                <CardTitle className="text-lg">LangChain Workflows</CardTitle>
                <CardDescription>
                  Advanced document processing with chain-of-thought reasoning, 
                  conversation memory, and context-aware interactions.
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Enterprise Security */}
            <Card className="border-gray-200 dark:border-gray-800 hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-gray-100 dark:bg-gray-900 rounded-lg flex items-center justify-center mb-3">
                  <Shield className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                </div>
                <CardTitle className="text-lg">Enterprise Security</CardTitle>
                <CardDescription>
                  Firebase-backed authentication, secure sessions, and a
                  privacy-first architecture.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Technology Stack */}
      <section className="py-16 px-4 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Cutting-Edge Technology
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              Built with modern AI frameworks and enterprise-grade infrastructure
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="bg-blue-100 dark:bg-blue-900 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Bot className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">AI Frameworks</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                LangChain workflows, CrewAI agents, OpenAI GPT-4, Local Ollama models
              </p>
            </div>

            <div className="text-center">
              <div className="bg-green-100 dark:bg-green-900 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Zap className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Modern Stack</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                React, TypeScript, Node.js, PostgreSQL, Tailwind CSS
              </p>
            </div>

            <div className="text-center">
              <div className="bg-purple-100 dark:bg-purple-900 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="h-8 w-8 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Security</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Firebase authentication, secure sessions, privacy-first architecture
              </p>
            </div>

            <div className="text-center">
              <div className="bg-orange-100 dark:bg-orange-900 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="h-8 w-8 text-orange-600 dark:text-orange-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Automation</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Real browser automation, scheduled applications, 24/7 monitoring
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats & Achievements */}
      <section className="py-16 px-4 bg-white dark:bg-gray-800">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Platform Impact
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              Measurable results that transform careers
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-blue-600 dark:text-blue-400 mb-2">60-80%</div>
              <div className="text-gray-600 dark:text-gray-300">Cost Reduction</div>
              <div className="text-sm text-gray-500 mt-1">Through smart AI routing</div>
            </div>
            
            <div>
              <div className="text-4xl font-bold text-green-600 dark:text-green-400 mb-2">24/7</div>
              <div className="text-gray-600 dark:text-gray-300">Automation</div>
              <div className="text-sm text-gray-500 mt-1">Continuous job searching</div>
            </div>
            
            <div>
              <div className="text-4xl font-bold text-purple-600 dark:text-purple-400 mb-2">6</div>
              <div className="text-gray-600 dark:text-gray-300">AI Specialists</div>
              <div className="text-sm text-gray-500 mt-1">Dedicated agent roles</div>
            </div>
            
            <div>
              <div className="text-4xl font-bold text-orange-600 dark:text-orange-400 mb-2">95%</div>
              <div className="text-gray-600 dark:text-gray-300">ATS Success</div>
              <div className="text-sm text-gray-500 mt-1">Resume optimization rate</div>
            </div>
          </div>
        </div>
      </section>

      {/* Founder Section */}
      <section className="py-16 px-4 bg-white dark:bg-gray-800">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Meet the Founder
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              From personal struggles to innovative solutions
            </p>
          </div>

          {/* Founder Hero Photo */}
          <div className="text-center mb-12">
            <div className="relative inline-block">
              <div className="w-32 h-32 mx-auto rounded-full overflow-hidden bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900 dark:to-purple-900 p-1">
                <div className="w-full h-full rounded-full overflow-hidden bg-white dark:bg-gray-800">
                  <img 
                    src={shivamPhoto}
                    alt="Shivam Kumar - Founder of JobGenie"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-green-500 rounded-full border-4 border-white dark:border-gray-800 flex items-center justify-center">
                <div className="w-3 h-3 bg-white rounded-full"></div>
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Shivam Kumar</h3>
              <p className="text-lg text-gray-600 dark:text-gray-300 mb-2">Founder & Software Engineer</p>
              <div className="flex justify-center gap-2">
                <Badge variant="secondary">5+ Years Experience</Badge>
                <Badge variant="secondary">Full-Stack Developer</Badge>
                <Badge variant="secondary">AI Specialist</Badge>
              </div>
            </div>
          </div>

          {/* Technical Skills */}
          <div className="mb-12">
            <Card className="max-w-4xl mx-auto">
              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-2">
                  <Brain className="h-6 w-6 text-blue-600" />
                  Technical Expertise
                </CardTitle>
                <CardDescription>
                  Technologies and frameworks used to build JobGenie's advanced AI capabilities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Backend Development</h4>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">Java</Badge>
                      <Badge variant="outline">Spring Boot</Badge>
                      <Badge variant="outline">Node.js</Badge>
                      <Badge variant="outline">Express.js</Badge>
                      <Badge variant="outline">PostgreSQL</Badge>
                      <Badge variant="outline">Microservices</Badge>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">AI & Frontend</h4>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">OpenAI</Badge>
                      <Badge variant="outline">LangChain</Badge>
                      <Badge variant="outline">CrewAI</Badge>
                      <Badge variant="outline">React</Badge>
                      <Badge variant="outline">TypeScript</Badge>
                      <Badge variant="outline">Tailwind CSS</Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-purple-600" />
                  The Inspiration
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 dark:text-gray-300">
                  "The idea for JobGenie came from my own job-hunting struggles — constantly rewriting resumes, 
                  manually crafting cover letters, and applying to dozens of roles with little feedback. 
                  It felt inefficient and outdated. I wanted to fix that with something smarter: 
                  an AI-powered platform that automates and personalizes every step of the job search process."
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-green-600" />
                  The Vision
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 dark:text-gray-300">
                  "I built JobGenie to be your personal AI job assistant — from parsing resumes and generating 
                  ATS-friendly cover letters to matching jobs and automating applications. This isn't just a tool, 
                  it's a complete career co-pilot designed for modern job seekers."
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Why JobGenie Exists - Problem-Focused */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <Card className="border-2 border-amber-200 dark:border-amber-800">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2 text-2xl">
                <Target className="h-6 w-6 text-amber-600" />
                Why JobGenie Exists
              </CardTitle>
              <CardDescription>
                Solving the broken job search process with intelligent automation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              {/* The Problem */}
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-red-600" />
                  The Job Search Problem
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  Job searching is fundamentally broken. Talented professionals waste 20+ hours per week on manual tasks: 
                  customizing resumes for each application, writing individual cover letters, navigating complex ATS systems, 
                  and tracking applications across multiple platforms — often with minimal results.
                </p>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-red-50 dark:bg-red-950 rounded-lg">
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">90%</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Time wasted on manual work</div>
                  </div>
                  <div className="text-center p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">2%</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Average response rate</div>
                  </div>
                  <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">6 months</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Average job search duration</div>
                  </div>
                </div>
              </div>

              {/* The Solution */}
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Zap className="h-5 w-5 text-blue-600" />
                  The JobGenie Solution
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  JobGenie automates the entire job search workflow using advanced AI. From intelligent resume optimization 
                  to 24/7 automated applications, our multi-agent system handles the tedious work while you focus on 
                  interview preparation and career growth.
                </p>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-gray-700 dark:text-gray-300">Automated job applications 24/7</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-gray-700 dark:text-gray-300">AI-optimized resumes for each job</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-gray-700 dark:text-gray-300">Personalized cover letters at scale</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-gray-700 dark:text-gray-300">Market intelligence and salary insights</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-gray-700 dark:text-gray-300">AI career mentorship and guidance</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-gray-700 dark:text-gray-300">Multi-platform job aggregation</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-center pt-6 border-t bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 rounded-lg p-6">
                <blockquote className="text-lg text-gray-700 dark:text-gray-300 italic">
                  "After mentoring dozens of professionals through job searches, I realized we needed to fix 
                  the process itself, not just help people navigate a broken system. JobGenie eliminates the 
                  manual work so you can focus on what matters: your career growth."
                </blockquote>
                <cite className="block mt-4 text-sm text-gray-500 dark:text-gray-400">
                  — Shivam Kumar, Founder of JobGenie
                </cite>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Contact & Location Section */}
      <section className="py-16 px-4 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Get in Touch
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              Connect with the founder and learn more about JobGenie
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Contact Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-6 w-6 text-blue-600" />
                  Contact Information
                </CardTitle>
                <CardDescription>
                  Reach out for partnerships, feedback, or collaboration opportunities
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <Phone className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">Phone</p>
                    <a 
                      href="tel:+919686454375" 
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      +91 9686454375
                    </a>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <Linkedin className="h-5 w-5 text-blue-700" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">LinkedIn</p>
                    <a 
                      href="https://www.linkedin.com/in/shivamkumar25/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      linkedin.com/in/shivamkumar25
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <MapPin className="h-5 w-5 text-red-600" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">Location</p>
                    <a 
                      href="https://www.google.com/maps/place/Shivam's+Home/@13.0611344,77.531688,17z/data=!3m1!4b1!4m6!3m5!1s0x3bae2334147880b9:0xc37d29ae8d443e2c!8m2!3d13.0611292!4d77.5342629!16s%2Fg%2F11rfqsw35b?entry=ttu&g_ep=EgoyMDI1MDYyMy4yIKXMDSoASAFQAw%3D%3D" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Bangalore, India (View on Maps)
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Interactive Map */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-6 w-6 text-red-600" />
                  Location
                </CardTitle>
                <CardDescription>
                  Click to open in Google Maps for directions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative w-full h-64 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
                  <iframe
                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3888.685855234567!2d77.53168817465843!3d13.061134413051234!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bae2334147880b9%3A0xc37d29ae8d443e2c!2sShivam's%20Home!5e0!3m2!1sen!2sin!4v1640000000000!5m2!1sen!2sin"
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    className="rounded-lg"
                  ></iframe>
                  
                  {/* Overlay for direct link */}
                  <div className="absolute inset-0 bg-transparent hover:bg-black hover:bg-opacity-10 transition-all duration-200 flex items-center justify-center group cursor-pointer">
                    <a 
                      href="https://www.google.com/maps/place/Shivam's+Home/@13.0611344,77.531688,17z/data=!3m1!4b1!4m6!3m5!1s0x3bae2334147880b9:0xc37d29ae8d443e2c!8m2!3d13.0611292!4d77.5342629!16s%2Fg%2F11rfqsw35b?entry=ttu&g_ep=EgoyMDI1MDYyMy4yIKXMDSoASAFQAw%3D%3D"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg"
                    >
                      Open in Google Maps
                    </a>
                  </div>
                </div>
                
                <div className="mt-4 text-center">
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => window.open('https://www.google.com/maps/place/Shivam\'s+Home/@13.0611344,77.531688,17z/data=!3m1!4b1!4m6!3m5!1s0x3bae2334147880b9:0xc37d29ae8d443e2c!8m2!3d13.0611292!4d77.5342629!16s%2Fg%2F11rfqsw35b?entry=ttu&g_ep=EgoyMDI1MDYyMy4yIKXMDSoASAFQAw%3D%3D', '_blank')}
                  >
                    <MapPin className="mr-2 h-4 w-4" />
                    Get Directions
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="py-20 px-4 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-4xl mx-auto text-center text-white">
          <h2 className="text-4xl font-bold mb-6">
            Ready to Transform Your Career?
          </h2>
          <p className="text-xl mb-8 opacity-90">
            Join thousands of professionals who have accelerated their career success with AI-powered job search automation.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/">
              <Button size="lg" variant="secondary" className="px-8 py-3">
                <Rocket className="mr-2 h-5 w-5" />
                Get Started Today
              </Button>
            </Link>
          </div>
          
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Badge variant="secondary" className="bg-white/20 text-white">
              No Credit Card Required
            </Badge>
            <Badge variant="secondary" className="bg-white/20 text-white">
              Free AI Testing
            </Badge>
            <Badge variant="secondary" className="bg-white/20 text-white">
              Enterprise Security
            </Badge>
          </div>
        </div>
      </section>
    </div>
  );
}