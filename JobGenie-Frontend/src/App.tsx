import {lazy, Suspense} from "react";
import {Route, Switch} from "wouter";
import {queryClient} from "./lib/queryClient";
import {QueryClientProvider} from "@tanstack/react-query";
import {Toaster} from "@/components/ui/toaster";
import {TooltipProvider} from "@/components/ui/tooltip";
import {ThemeProvider} from "@/components/theme-provider";
import {ErrorBoundary} from '@/components/error-boundary';
import { AuthProvider } from "./context/AuthContext";

// Each page is loaded on demand, so the first visit downloads only the page being viewed
// (plus shared code) instead of all twenty.
const NotFound = lazy(() => import("@/pages/not-found"));
const Landing = lazy(() => import("@/pages/landing"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const ResumeAssistant = lazy(() => import("@/pages/resume-assistant"));
const JobMatches = lazy(() => import("@/pages/job-matches"));
const CoverLetters = lazy(() => import("@/pages/cover-letters"));
const ATSGenerator = lazy(() => import("@/pages/ats-generator"));
const Notifications = lazy(() => import("@/pages/notifications"));
const Preferences = lazy(() => import("@/pages/preferences"));
const Automation = lazy(() => import("@/pages/automation"));
const CareerMentor = lazy(() => import("@/pages/career-mentor"));
const Profile = lazy(() => import("@/pages/profile"));
const CandidateProfilePage = lazy(() => import("@/pages/candidate-profile"));
const JobDiscovery = lazy(() => import("@/pages/job-discovery"));
const Approvals = lazy(() => import("@/pages/approvals"));
const MarketIntelligence = lazy(() => import("@/pages/market-intelligence"));
const AdminPage = lazy(() => import("@/pages/admin"));
const About = lazy(() => import("@/pages/about"));
const Demo = lazy(() => import("@/pages/demo"));
const JobAggregator = lazy(() => import("@/pages/job-aggregator"));
const ApplicationHistory = lazy(() => import("@/pages/application-history"));
const Login = lazy(() => import("@/pages/login"));
const Analytics = lazy(() => import("@/pages/analytics"));

function Router() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>}>
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/resume-assistant" component={ResumeAssistant} />
      <Route path="/job-matches" component={JobMatches} />
      <Route path="/application-history" component={ApplicationHistory} />
      <Route path="/cover-letters" component={CoverLetters} />
      <Route path="/ats-generator" component={ATSGenerator} />
      <Route path="/notifications" component={Notifications} />
      <Route path="/preferences" component={Preferences} />
      <Route path="/automation" component={Automation} />
      <Route path="/job-aggregator" component={JobAggregator} />
      <Route path="/career-mentor" component={CareerMentor} />
      <Route path="/market-intelligence" component={MarketIntelligence} />
      <Route path="/profile" component={Profile} />
      <Route path="/candidate-profile" component={CandidateProfilePage} />
      <Route path="/job-discovery" component={JobDiscovery} />
      <Route path="/approvals" component={Approvals} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/about" component={About} />
      <Route path="/demo" component={Demo} />
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider defaultTheme="light" storageKey="jobgenie-ui-theme">
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
