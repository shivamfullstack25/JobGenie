import {Card, CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Link} from "wouter";
import {
    ArrowRight,
    Award,
    Bot,
    Brain,
    CheckCircle,
    Clock,
    FileText,
    Info,
    Rocket,
    Search,
    Shield,
    Sparkles,
    Target,
    TrendingUp,
    Users,
    Zap
} from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Navigation Header */}
      <header className="bg-white/95 backdrop-blur-md shadow-lg border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-pointer">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-110">
              <Bot className="h-7 w-7 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">JobGenie</span>
              <span className="text-xs text-gray-500 font-medium tracking-wide">AI Career Assistant</span>
            </div>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/about">
              <Button variant="ghost" className="flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-blue-50 transition-all duration-200 group">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-100 to-purple-100 rounded-lg flex items-center justify-center group-hover:from-blue-200 group-hover:to-purple-200 transition-all duration-200">
                  <Info className="h-4 w-4 text-blue-600" />
                </div>
                <span className="font-medium text-gray-700 group-hover:text-blue-600 transition-colors">About</span>
              </Button>
            </Link>
            <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all duration-300 px-6 py-3 rounded-xl group">
              <Link href="/login" className="flex items-center gap-3">
                <div className="w-5 h-5 bg-white/20 rounded-lg flex items-center justify-center group-hover:bg-white/30 transition-all duration-200">
                  <Rocket className="h-3 w-3 text-white" />
                </div>
                <span className="font-semibold text-white">Get Started</span>
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 bg-blue-100 rounded-full">
            <Sparkles className="h-5 w-5 text-blue-600" />
            <span className="text-blue-700 font-medium">AI-Powered Career Intelligence</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold text-gray-900 mb-6 leading-tight">
            Land Your
            <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent block">
              Dream Job
            </span>
            <span className="text-gray-700">with AI</span>
          </h1>
          
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
            Transform your job search with our intelligent multi-agent system that optimizes resumes, 
            applies to jobs automatically, and provides personalized career guidance 24/7.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button size="lg" className="px-8 py-4 text-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
              <Link href="/login" className="flex items-center gap-2">
                <Rocket className="h-5 w-5" />
                Start Your Journey
              </Link>
            </Button>
            <Link href="/demo">
              <Button variant="outline" size="lg" className="px-8 py-4 text-lg border-2 hover:bg-gray-50">
                <Brain className="mr-2 h-5 w-5" />
                Watch Live Demo
              </Button>
            </Link>
          </div>

          {/* Trust Indicators */}
          <div className="flex flex-wrap justify-center gap-4 mb-16">
            <Badge variant="secondary" className="bg-green-100 text-green-700 px-4 py-2">
              <CheckCircle className="mr-2 h-4 w-4" />
              60-80% Cost Savings
            </Badge>
            <Badge variant="secondary" className="bg-blue-100 text-blue-700 px-4 py-2">
              <Clock className="mr-2 h-4 w-4" />
              24/7 Automation
            </Badge>
            <Badge variant="secondary" className="bg-purple-100 text-purple-700 px-4 py-2">
              <Shield className="mr-2 h-4 w-4" />
              Enterprise Security
            </Badge>
          </div>
        </div>
      </section>

      {/* Features Showcase */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Why Choose JobGenie?
            </h2>
            <p className="text-xl text-gray-600">
              Advanced AI technology meets practical job search solutions
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 group">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-300">
                  <Brain className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">Multi-Agent AI System</h3>
                <p className="text-gray-600 leading-relaxed">
                  Specialized AI agents collaborate on research, resume optimization, 
                  cover letter writing, and strategic planning for maximum success.
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 group">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-300">
                  <Zap className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">Automated Applications</h3>
                <p className="text-gray-600 leading-relaxed">
                  Real browser automation applies to jobs 24/7 across multiple platforms 
                  with personalized applications for each opportunity.
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 group">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-300">
                  <Award className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">ATS Optimization</h3>
                <p className="text-gray-600 leading-relaxed">
                  Advanced resume optimization ensures your applications pass Applicant 
                  Tracking Systems with intelligent keyword analysis.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Feature List */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <Card className="border-0 shadow-xl">
            <CardContent className="p-12">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">
                  Everything You Need to Succeed
                </h2>
                <p className="text-lg text-gray-600">
                  Comprehensive AI-powered tools for every step of your job search
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <FileText className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">Smart Resume Analysis</h4>
                      <p className="text-gray-600">AI extracts and optimizes your key information</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <Search className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">Intelligent Job Matching</h4>
                      <p className="text-gray-600">Find perfect opportunities based on your profile</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                      <Target className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">Cover Letter Generation</h4>
                      <p className="text-gray-600">Personalized cover letters for every application</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">Market Intelligence</h4>
                      <p className="text-gray-600">Salary insights and industry trend analysis</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                      <Users className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">Career Mentorship</h4>
                      <p className="text-gray-600">AI-powered guidance and interview preparation</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                      <Clock className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">24/7 Automation</h4>
                      <p className="text-gray-600">Continuous job searching while you sleep</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-center mt-12">
                <Link href="/login">
                  <Button
                    size="lg"
                    className="px-8 py-4 text-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  >
                    <span className="flex items-center gap-2">
                      Get Started with JobGenie
                      <ArrowRight className="h-5 w-5" />
                    </span>
                  </Button>
                </Link>
                <p className="text-sm text-gray-500 mt-4">
                  Sign in to access your personalized job search dashboard
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Call to Action */}
      <section className="py-20 px-4 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600">
        <div className="max-w-4xl mx-auto text-center text-white">
          <h2 className="text-4xl font-bold mb-6">
            Ready to Transform Your Career?
          </h2>
          <p className="text-xl mb-8 opacity-90">
            Join professionals who have accelerated their career success with AI-powered automation.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login">
              <Button size="lg" variant="secondary" className="px-8 py-4 text-lg">
                <span className="flex items-center gap-2">
                  <Rocket className="h-5 w-5" />
                  Start Free Today
                </span>
              </Button>
            </Link>
            <Link href="/demo">
              <Button size="lg" variant="outline" className="px-8 py-4 text-lg border-white text-white hover:bg-white hover:text-blue-600">
                <Brain className="mr-2 h-5 w-5" />
                Watch Demo
              </Button>
            </Link>
          </div>
          
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
              No Credit Card Required
            </Badge>
            <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
              Free AI Testing
            </Badge>
            <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
              Enterprise Security
            </Badge>
          </div>
        </div>
      </section>
    </div>
  );
}