import {Route, Switch} from "wouter";
import {queryClient} from "./lib/queryClient";
import {QueryClientProvider} from "@tanstack/react-query";
import {Toaster} from "@/components/ui/toaster";
import {TooltipProvider} from "@/components/ui/tooltip";
import {ThemeProvider} from "@/components/theme-provider";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import ResumeAssistant from "@/pages/resume-assistant";
import JobMatches from "@/pages/job-matches";
import CoverLetters from "@/pages/cover-letters";
import ATSGenerator from "@/pages/ats-generator";
import Notifications from "@/pages/notifications";
import Preferences from "@/pages/preferences";
import Automation from "@/pages/automation";
import CareerMentor from "@/pages/career-mentor";
import Profile from "@/pages/profile";
import MarketIntelligence from "@/pages/market-intelligence";
import AdminPage from "@/pages/admin";
import About from "@/pages/about";
import Demo from "@/pages/demo";
import JobAggregator from "@/pages/job-aggregator";
import ApplicationHistory from "@/pages/application-history";
import {ErrorBoundary} from '@/components/error-boundary';
import { AuthProvider } from "./context/AuthContext";
import Login from "@/pages/login";
import Analytics from "@/pages/analytics";

function Router() {
  return (
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
      <Route path="/admin" component={AdminPage} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/about" component={About} />
      <Route path="/demo" component={Demo} />
      <Route component={NotFound} />
    </Switch>
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
