import {Link, useLocation} from "wouter";
import {Button} from "@/components/ui/button";
import {ThemeToggle} from "@/components/theme-toggle";
import BrandMark from "@/components/brand-mark";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {Bell, ChevronDown, LogOut, Menu, Settings, User} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

type NavItem = { path: string; label: string };

// The core loop, in the order a user works through it.
const LOOP: NavItem[] = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/candidate-profile", label: "My profile" },
  { path: "/job-discovery", label: "Discover" },
  { path: "/approvals", label: "Approvals" },
  { path: "/application-history", label: "History" },
];

const TOOLS: NavItem[] = [
  { path: "/job-matches", label: "Job matches" },
  { path: "/job-aggregator", label: "Job search" },
  { path: "/resume-assistant", label: "Resume assistant" },
  { path: "/ats-generator", label: "ATS resume" },
  { path: "/cover-letters", label: "Cover letters" },
  { path: "/automation", label: "Search schedules" },
  { path: "/career-mentor", label: "Career mentor" },
  { path: "/market-intelligence", label: "Market insights" },
  { path: "/about", label: "About" },
];

const ADMIN: NavItem[] = [
  { path: "/admin", label: "Admin" },
  { path: "/analytics", label: "Analytics" },
];

function MenuLinks({ items }: { items: NavItem[] }) {
  return (
    <>
      {items.map((item) => (
        <DropdownMenuItem key={item.path} asChild>
          <Link href={item.path} className="w-full cursor-pointer">
            {item.label}
          </Link>
        </DropdownMenuItem>
      ))}
    </>
  );
}

export default function Navigation() {
  const [location] = useLocation();
  const { isAdmin, logout, backendUser, firebaseUser } = useAuth();

  const displayName =
    backendUser?.name || firebaseUser?.displayName || firebaseUser?.email || "Account";
  const avatarUrl = backendUser?.profileImageUrl || firebaseUser?.photoURL;
  const initial = displayName.trim().charAt(0).toUpperCase();

  return (
    <nav className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 lg:px-6">
        <Link href="/dashboard" aria-label="JobGenie dashboard">
          <BrandMark />
        </Link>

        <div className="hidden h-full items-stretch gap-1 lg:flex">
          {LOOP.map((item) => {
            const active = location === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                aria-current={active ? "page" : undefined}
                className={`flex items-center border-b-2 px-3 text-sm font-medium transition-colors ${
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground hover:text-foreground">
                More
                <ChevronDown className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <MenuLinks items={TOOLS} />
              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <MenuLinks items={ADMIN} />
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />

          <Button variant="ghost" size="icon" asChild>
            <Link href="/notifications" aria-label="Notifications">
              <Bell className="h-5 w-5" />
            </Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2" aria-label="Account menu">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                    {initial}
                  </span>
                )}
                <span className="hidden max-w-[10rem] truncate text-sm font-medium xl:block">{displayName}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem asChild>
                <Link href="/profile" className="cursor-pointer">
                  <User className="mr-2 h-4 w-4" />
                  Account
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/preferences" className="cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  Job preferences
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void logout()}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Below lg the loop links are hidden, so everything lives in this menu. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[80vh] w-56 overflow-y-auto">
              <MenuLinks items={LOOP} />
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">More</DropdownMenuLabel>
              <MenuLinks items={TOOLS} />
              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <MenuLinks items={ADMIN} />
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );
}
