import {useQuery} from "@tanstack/react-query";
import Navigation from "@/components/navigation";
import ResumeUpload from "@/components/resume-upload";
import ResumeMetadata from "@/components/resume-metadata";
import AiInsights from "@/components/ai-insights";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Award, BarChart3, Brain, Briefcase, FileText, Search, TrendingUp, Upload, Users, Zap} from "lucide-react";
import {Link} from "wouter";
import {LoadingCard} from '@/components/ui/loading-spinner';
import { useAuth } from "../context/AuthContext";
import { useLocation } from "wouter";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useEffect, useState } from "react";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

const db = getFirestore();
const storage = getStorage();

function ProfileCompletionModal({ user, onComplete }: { user: any, onComplete: () => void }) {
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [resume, setResume] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      let resumeUrl = "";
      if (resume) {
        const storageRef = ref(storage, `resumes/${user.uid}/${resume.name}`);
        await uploadBytes(storageRef, resume);
        resumeUrl = await getDownloadURL(storageRef);
      }
      await setDoc(doc(db, "users", user.uid), {
        phone,
        location,
        ...(resumeUrl && { resumeUrl })
      }, { merge: true });
      onComplete();
    } catch (err: any) {
      setError("Failed to save profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Complete Your Profile</h2>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <input
            type="tel"
            placeholder="Phone Number"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            className="border rounded px-3 py-2"
            required
          />
          <input
            type="text"
            placeholder="Location (City, Country)"
            value={location}
            onChange={e => setLocation(e.target.value)}
            className="border rounded px-3 py-2"
            required
          />
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={e => setResume(e.target.files?.[0] || null)}
            className="border rounded px-3 py-2"
          />
          <span className="text-xs text-gray-500">Upload your resume (PDF, DOC, DOCX)</span>
          {error && <div className="text-red-500 text-sm text-center">{error}</div>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Saving..." : "Save & Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function ProfileCompletionBar({ user }: { user: any }) {
  const [progress, setProgress] = useState(0);
  const [fields, setFields] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    const fetchProfile = async () => {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      const data = userSnap.data() || {};
      const checks = {
        name: !!data.name,
        email: !!data.email,
        phone: !!data.phone,
        location: !!data.location,
        resumeUrl: !!data.resumeUrl
      };
      setFields(checks);
      setProgress((Object.values(checks).filter(Boolean).length / Object.keys(checks).length) * 100);
    };
    fetchProfile();
  }, [user]);

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">Profile Completion</span>
        <span className="text-xs text-gray-500">{Math.round(progress)}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
      </div>
      <div className="flex flex-wrap gap-2 mt-2 text-xs">
        {Object.entries(fields).map(([key, filled]) => (
          <span key={key} className={`px-2 py-1 rounded ${filled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{key}</span>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, backendUser, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileChecked, setProfileChecked] = useState(false);

  // Initialize WebSocket for real-time updates
  const { isConnected } = useWebSocket({
    autoConnect: true,
    onMessage: (message) => {
      console.log('Dashboard received WebSocket message:', message);
    }
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/gateway/stats"],
    enabled: !!user,
  });

  const { data: resumes = [], isLoading: resumesLoading } = useQuery({
    queryKey: ["dashboard-resumes", backendUser?.id],
    queryFn: async () => {
      if (!backendUser?.id) return [];
      const { resumeAPI } = await import("@/lib/api");
      return resumeAPI.getUserResumes(backendUser.id);
    },
    enabled: !!backendUser?.id,
  });

  const { data: jobMatches = [], isLoading: matchesLoading } = useQuery({
    queryKey: ["dashboard-matches", backendUser?.id],
    queryFn: async () => {
      if (!backendUser?.id) return [];
      const { jobAPI } = await import("@/lib/api");
      const response = await jobAPI.getJobMatches(backendUser.id.toString());
      return response.matches || [];
    },
    enabled: !!backendUser?.id,
  });

  useEffect(() => {
    if (!loading && !user) {
      setLocation("/login");
    }
  }, [user, loading, setLocation]);

  useEffect(() => {
    const checkProfile = async () => {
      if (user) {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        const data = userSnap.data();
        if (!data?.phone || !data?.location) {
          setShowProfileModal(true);
        }
        setProfileChecked(true);
      }
    };
    if (user && !profileChecked) {
      checkProfile();
    }
  }, [user, profileChecked]);

  if (loading) return <LoadingCard text="Loading dashboard..." />;
  if (!user) return null;

  const latestResume = Array.isArray(resumes) ? resumes[0] : null;

  if (statsLoading || resumesLoading || matchesLoading) {
    return <LoadingCard text="Loading dashboard..." />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-slate-900 dark:to-gray-900">
      {showProfileModal && <ProfileCompletionModal user={user} onComplete={() => setShowProfileModal(false)} />}
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10 space-y-8 lg:space-y-12">
        <ProfileCompletionBar user={user} />
        {/* Dashboard Header */}
        <div className="text-center lg:text-left">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-3 lg:mb-4">
            Welcome back, User!
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto lg:mx-0">
            Let's find your next opportunity with AI-powered job matching.
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardContent className="p-6 lg:p-8">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Resumes Uploaded</p>
                  <p className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">{(stats as any)?.totalResumes || 0}</p>
                </div>
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center">
                  <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardContent className="p-6 lg:p-8">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Job Matches</p>
                  <p className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">{(stats as any)?.totalJobMatches || 0}</p>
                </div>
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-2xl flex items-center justify-center">
                  <Search className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardContent className="p-6 lg:p-8">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Applications Sent</p>
                  <p className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">{(stats as any)?.totalJobApplications || 0}</p>
                </div>
                <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center">
                  <Briefcase className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardContent className="p-6 lg:p-8">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Response Rate</p>
                  <p className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">
                    {(() => {
                      const matches = (stats as any)?.totalJobMatches || 0;
                      const applications = (stats as any)?.totalJobApplications || 0;
                      return matches > 0 ? Math.round((applications / matches) * 100) : 0;
                    })()}%
                  </p>
                </div>
                <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-2xl flex items-center justify-center">
                  <TrendingUp className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mb-6 lg:mb-8">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div onClick={() => {
              const resumeSection = document.getElementById('resume-management');
              resumeSection?.scrollIntoView({ behavior: 'smooth' });
            }}>
              <Card className="bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer group h-full">
                <CardContent className="p-8 text-center h-full flex flex-col justify-center">
                  <Upload className="h-12 w-12 mx-auto mb-4 group-hover:scale-110 transition-transform" />
                  <h3 className="font-semibold text-xl mb-2">Upload Resume</h3>
                  <p className="text-blue-100">Get AI-powered analysis</p>
                </CardContent>
              </Card>
            </div>

            <Link href="/job-aggregator">
              <Card className="bg-gradient-to-br from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer group h-full">
                <CardContent className="p-8 text-center h-full flex flex-col justify-center">
                  <Search className="h-12 w-12 mx-auto mb-4 group-hover:scale-110 transition-transform" />
                  <h3 className="font-semibold text-xl mb-2">Find Jobs</h3>
                  <p className="text-green-100">Multi-platform search</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/ats-generator">
              <Card className="bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer group h-full">
                <CardContent className="p-8 text-center h-full flex flex-col justify-center">
                  <Award className="h-12 w-12 mx-auto mb-4 group-hover:scale-110 transition-transform" />
                  <h3 className="font-semibold text-xl mb-2">ATS Generator</h3>
                  <p className="text-purple-100">Optimize for systems</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/automation">
              <Card className="bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer group h-full">
                <CardContent className="p-8 text-center h-full flex flex-col justify-center">
                  <Zap className="h-12 w-12 mx-auto mb-4 group-hover:scale-110 transition-transform" />
                  <h3 className="font-semibold text-xl mb-2">Automation</h3>
                  <p className="text-orange-100">Automated applications</p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column - Resume & Tools */}
          <div className="lg:col-span-2 space-y-8">
            <div id="resume-management">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Resume Management</h2>
              
              {latestResume ? (
                <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-lg">Latest Resume Analysis</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ResumeMetadata resume={latestResume} />
                    <AiInsights resume={latestResume} />
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
                  <CardContent className="p-8">
                    <ResumeUpload />
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Additional Tools */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Advanced Tools</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Link href="/market-intelligence">
                  <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer group">
                    <CardContent className="p-6 text-center">
                      <BarChart3 className="h-12 w-12 mx-auto mb-4 text-indigo-600 group-hover:scale-110 transition-transform" />
                      <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-white">Market Intelligence</h3>
                      <p className="text-gray-600 dark:text-gray-400 text-sm">Salary insights & market trends</p>
                    </CardContent>
                  </Card>
                </Link>

                <Link href="/career-mentor">
                  <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer group">
                    <CardContent className="p-6 text-center">
                      <Users className="h-12 w-12 mx-auto mb-4 text-pink-600 group-hover:scale-110 transition-transform" />
                      <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-white">Career Mentor</h3>
                      <p className="text-gray-600 dark:text-gray-400 text-sm">AI-powered career guidance</p>
                    </CardContent>
                  </Card>
                </Link>

                <Link href="/notifications">
                  <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer group">
                    <CardContent className="p-6 text-center">
                      <Brain className="h-12 w-12 mx-auto mb-4 text-cyan-600 group-hover:scale-110 transition-transform" />
                      <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-white">Notifications</h3>
                      <p className="text-gray-600 dark:text-gray-400 text-sm">Stay updated on progress</p>
                    </CardContent>
                  </Card>
                </Link>

                <Link href="/preferences">
                  <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer group">
                    <CardContent className="p-6 text-center">
                      <TrendingUp className="h-12 w-12 mx-auto mb-4 text-emerald-600 group-hover:scale-110 transition-transform" />
                      <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-white">Preferences</h3>
                      <p className="text-gray-600 dark:text-gray-400 text-sm">Customize your settings</p>
                    </CardContent>
                  </Card>
                </Link>
              </div>
            </div>
          </div>

          {/* Right Column - Job Opportunities */}
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Job Opportunities</h2>
            
            {Array.isArray(jobMatches) && jobMatches.length > 0 ? (
              <div className="space-y-4">
                {jobMatches.slice(0, 3).map((match: any, index: number) => (
                  <div key={index} className="p-4 border rounded-lg bg-white dark:bg-gray-800">
                    <h3 className="font-semibold">{match.title || 'Job Match'}</h3>
                    <p className="text-gray-600 dark:text-gray-400">{match.company || 'Company'}</p>
                    <p className="text-sm text-blue-600">{match.match || 90}% match</p>
                  </div>
                ))}
                {jobMatches.length > 3 && (
                  <Link href="/job-matches">
                    <Button variant="outline" className="w-full">
                      View All {jobMatches.length} Matches
                    </Button>
                  </Link>
                )}
              </div>
            ) : (
              <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
                <CardContent className="p-8 text-center">
                  <Search className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No Job Matches Yet</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">Upload your resume to get AI-powered job recommendations</p>
                  <Link href="/resume-assistant">
                    <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                      Get Started
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}
            
            {/* Cover Letter Generator */}
            {latestResume && (
              <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">Cover Letter Generator</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="p-4 border rounded-lg">
                    <p className="text-gray-600 dark:text-gray-400 mb-4">Generate personalized cover letters for job applications</p>
                    <Link href="/cover-letter-generator">
                      <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                        Create Cover Letter
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}