import {Link, useLocation} from "wouter";
import {Button} from "@/components/ui/button";
import {ThemeToggle} from "@/components/theme-toggle";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {Bell, ChevronDown, LogOut, Settings, User} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function Navigation() {
  const [location] = useLocation();
  const { isAdmin, logout, backendUser, firebaseUser } = useAuth();

  const mainNavItems = [
    { path: "/dashboard", label: "Dashboard", icon: "🏠" },
    { path: "/job-matches", label: "Jobs", icon: "💼" },
    { path: "/application-history", label: "History", icon: "📋" },
    { path: "/resume-assistant", label: "AI Assistant", icon: "🤖" },
    { path: "/automation", label: "Automation", icon: "⚡" },
    { path: "/about", label: "About", icon: "ℹ️" },
  ];
  if (isAdmin) {
    mainNavItems.push({ path: "/admin", label: "Admin", icon: "🛡️" });
    mainNavItems.push({ path: "/analytics", label: "Analytics", icon: "📈" });
  }

  // Secondary "Tools" area — demoted per CLAUDE.md's KEEP/CUT/REBUILD table (these pages stay,
  // they just don't get primary nav real estate).
  const toolsItems = [
    { path: "/ats-generator", label: "ATS Generator" },
    { path: "/cover-letters", label: "Cover Letters" },
    { path: "/job-aggregator", label: "Job Search" },
    { path: "/career-mentor", label: "Career Mentor" },
    { path: "/market-intelligence", label: "Market Intelligence" },
  ];

  const displayName =
    backendUser?.name || firebaseUser?.displayName || firebaseUser?.email || "User";
  const avatarUrl =
    backendUser?.profileImageUrl ||
    firebaseUser?.photoURL ||
    `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect fill="#e2e8f0" width="64" height="64"/><circle cx="32" cy="24" r="12" fill="#94a3b8"/><ellipse cx="32" cy="56" rx="20" ry="16" fill="#94a3b8"/></svg>`,
    )}`;
  return (
    <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50 shadow-sm backdrop-blur-sm bg-white/80 dark:bg-gray-900/80">
      <div className="max-w-7xl mx-auto px-4 lg:px-6">
        <div className="flex justify-between items-center h-20 min-w-0">
          {/* Logo */}
          <div className="flex-shrink-0">
            <Link href="/">
              <div className="flex items-center cursor-pointer">
                <span className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  JobGenie
                </span>
              </div>
            </Link>
          </div>

          {/* Main Navigation - Simplified */}
          <div className="hidden lg:flex items-center space-x-8 ml-12">
            {mainNavItems.map((item) => (
              <Link key={item.path} href={item.path}>
                <span className={`flex items-center px-4 py-2 rounded-xl text-base font-medium transition-all duration-200 cursor-pointer ${
                  location === item.path
                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                    : "text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}>
                  <span className="mr-2">{item.icon}</span>
                  {item.label}
                </span>
              </Link>
            ))}

            {/* Tools Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center px-4 py-2 rounded-xl text-base font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800">
                  Tools
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 mt-2">
                {toolsItems.map((item) => (
                  <DropdownMenuItem key={item.path} asChild>
                    <Link href={item.path}>
                      <span className="cursor-pointer w-full py-2">{item.label}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Right side - Clean and spacious */}
          <div className="flex items-center space-x-3 flex-shrink-0">
            <ThemeToggle />
            
            {/* Notifications */}
            <Link href="/notifications">
              <Button variant="ghost" size="sm" className="relative p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">
                <Bell className="h-5 w-5" />
              </Button>
            </Link>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center space-x-2 px-2 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">
                  <img 
                    src={avatarUrl} 
                    alt="Profile" 
                    className="w-9 h-9 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700 flex-shrink-0"
                  />
                  <span className="hidden lg:block font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                    {displayName}
                  </span>
                  <ChevronDown className="h-4 w-4 text-gray-500 flex-shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 mt-2">
                <DropdownMenuItem asChild>
                  <Link href="/preferences">
                    <Settings className="mr-3 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile">
                    <User className="mr-3 h-4 w-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                                <DropdownMenuItem
                  onClick={() => {
                    void logout();
                  }}
                >
                  <LogOut className="mr-3 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </nav>
  );
}