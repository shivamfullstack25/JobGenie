import {Button} from "@/components/ui/button";
import BrandMark from "@/components/brand-mark";
import {Link} from "wouter";
import {Check, ExternalLink, X} from "lucide-react";

const STEPS = [
  {
    title: "Build your profile",
    body: "Upload your resume. Every fact keeps its source, and nothing the software infers counts as fact until you approve it.",
  },
  {
    title: "Discover jobs",
    body: "Search public company job boards (Greenhouse, Lever, Ashby) and Adzuna. Duplicates are merged and suspicious listings are flagged.",
  },
  {
    title: "Approve what's worth it",
    body: "Each match comes with a tailored resume, cover letter and answers drawn only from your profile. Anything unknown is left for you to fill in.",
  },
  {
    title: "Track every application",
    body: "Apply on the employer's site, mark it submitted, then follow it through interviews to an offer or a no.",
  },
];

const WONT = [
  "Submit an application for you.",
  "Ask for your LinkedIn, Indeed or Naukri password.",
  "Invent skills, numbers or experience you don't have.",
  "Scrape job sites that don't allow it.",
];

/** A static example of the Approvals screen: the moment the product is built around. */
function ExampleApproval() {
  return (
    <figure className="w-full max-w-md justify-self-center lg:justify-self-end">
      <div className="rounded-lg border bg-card shadow-[0_1px_0_var(--border),0_24px_48px_-24px_hsl(210_31%_13%/0.25)]">
        <div className="flex items-start justify-between gap-4 border-b p-5">
          <div>
            <p className="text-lg font-bold leading-tight">Backend Engineer, Payments</p>
            <p className="mt-1 text-sm text-muted-foreground">Northwind Labs, Bengaluru (hybrid)</p>
          </div>
          <div className="text-right">
            <p className="tabular text-3xl font-extrabold leading-none text-primary">78</p>
            <p className="mt-1 text-xs text-muted-foreground">match</p>
          </div>
        </div>

        <dl className="space-y-3 p-5 text-sm">
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-muted-foreground">You have</dt>
            <dd>Java, Spring Boot, PostgreSQL, Kafka</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-muted-foreground">Missing</dt>
            <dd>Go</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-muted-foreground">Not scored</dt>
            <dd>Salary isn't listed, so it's left out of the score</dd>
          </div>
        </dl>

        <ul className="space-y-2 border-t p-5 text-sm">
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" aria-hidden="true" />
            Resume tailored from your profile
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" aria-hidden="true" />
            Cover letter drafted
          </li>
          <li className="flex items-center gap-2">
            <span className="rounded-sm bg-signal px-1.5 text-xs font-semibold text-signal-foreground">2</span>
            answers need your input
          </li>
        </ul>

        <div className="flex gap-2 border-t p-5">
          <span className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            Approve and open job page
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium">Skip</span>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-muted-foreground lg:text-right">
        Example approval. You submit on the employer's site, then mark it applied.
      </figcaption>
    </figure>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <BrandMark />
          <nav className="flex items-center gap-1 sm:gap-2">
            <a href="#how" className="hidden px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground sm:block">
              How it works
            </a>
            <Link href="/about" className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
              About
            </Link>
            <Button asChild size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div className="max-w-xl">
            <h1 className="text-4xl font-extrabold leading-[1.05] sm:text-5xl lg:text-6xl">
              Apply to fewer jobs. Better ones.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              JobGenie reads your real experience, finds roles on public company job boards, shows why each
              one fits, and prepares a tailored application. You review it and apply on the employer's site.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/login">Sign in to start</Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <a href="#how">See how it works</a>
              </Button>
            </div>
          </div>
          <ExampleApproval />
        </section>

        <section id="how" className="scroll-mt-8 border-t bg-card">
          <div className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
            <h2 className="text-3xl font-bold">How it works</h2>
            <ol className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              {STEPS.map((step, i) => (
                <li key={step.title} className="border-t-2 border-foreground pt-4">
                  <span className="tabular text-sm font-semibold text-primary">Step {i + 1}</span>
                  <h3 className="mt-2 text-lg font-bold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-[1fr_1.4fr] lg:py-20">
            <div>
              <h2 className="text-3xl font-bold">What JobGenie won't do</h2>
              <p className="mt-4 max-w-sm text-muted-foreground">
                These are product rules, not settings. Your accounts on job sites stay yours.
              </p>
            </div>
            <ul className="divide-y border-y">
              {WONT.map((line) => (
                <li key={line} className="flex items-center gap-4 py-4 text-lg">
                  <X className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t bg-primary text-primary-foreground">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-14 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-2xl font-bold leading-snug">
              Ten applications you'd stand behind beat a hundred you wouldn't.
            </p>
            <Button asChild size="lg" variant="secondary">
              <Link href="/login">Sign in to start</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground">
          <BrandMark className="scale-90 origin-left" />
          <Link href="/about" className="hover:text-foreground">About</Link>
        </div>
      </footer>
    </div>
  );
}
