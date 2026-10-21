import {useMemo, useState} from "react";
import {useMutation, useQuery} from "@tanstack/react-query";
import {Link, useLocation} from "wouter";
import Navigation from "@/components/navigation";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {useAuth} from "@/context/AuthContext";
import {useToast} from "@/hooks/use-toast";
import {applicationAPI, discoveryAPI, jobAPI, profileAPI, type DiscoveredJob} from "@/lib/api";

const STORAGE_KEY = "jobgenie-discovery-form";

const DEFAULT_QUESTIONS = [
  "What is your notice period?",
  "What are your salary expectations?",
  "Are you authorized to work in this country?",
  "Will you now or in the future require visa sponsorship?",
  "Total years of professional experience?",
  "Are you willing to relocate?",
].join("\n");

function loadForm() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") ?? {};
  } catch {
    return {};
  }
}

const RECOMMENDATION: Record<string, { label: string; className: string }> = {
  STRONG_MATCH: { label: "Strong match", className: "bg-green-100 text-green-800 border-green-200" },
  GOOD_MATCH: { label: "Good match", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  PARTIAL_MATCH: { label: "Partial match", className: "bg-amber-100 text-amber-800 border-amber-200" },
  WEAK_MATCH: { label: "Weak match", className: "bg-gray-100 text-gray-700 border-gray-200" },
  NOT_ELIGIBLE: { label: "Not eligible", className: "bg-red-100 text-red-800 border-red-200" },
};

const MODE_LABEL: Record<string, string> = {
  FULLY_AUTOMATED: "Search allowed (official feed)",
  BROWSER_ASSISTED: "You apply yourself",
  DRAFT_ONLY: "Drafts only",
  BLOCKED: "Not permitted",
  HUMAN_APPROVAL: "Needs your approval",
};

function money(job: DiscoveredJob["job"]) {
  if (!job.salary_min && !job.salary_max) return null;
  const fmt = (n: number) => n.toLocaleString();
  const range = job.salary_min && job.salary_max ? `${fmt(job.salary_min)} – ${fmt(job.salary_max)}` : fmt((job.salary_min ?? job.salary_max)!);
  return `${job.currency ?? ""} ${range}`.trim();
}

export default function JobDiscovery() {
  const { backendUser } = useAuth();
  const { toast } = useToast();
  const saved = loadForm();
  const [keywords, setKeywords] = useState<string>(saved.keywords ?? "");
  const [location, setLocation] = useState<string>(saved.location ?? "");
  const [boards, setBoards] = useState<string>(saved.boards ?? "");
  const [useProfile, setUseProfile] = useState<boolean>(saved.useProfile ?? true);
  const [done, setDone] = useState<Record<string, "saved" | "applied">>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [questions, setQuestions] = useState<string>(saved.questions ?? DEFAULT_QUESTIONS);
  const [preparing, setPreparing] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const userId = backendUser?.id;

  const profile = useQuery({
    queryKey: ["candidate-profile", userId],
    queryFn: () => profileAPI.get(userId!),
    enabled: !!userId && useProfile,
  });
  const policies = useQuery({ queryKey: ["platform-policies"], queryFn: discoveryAPI.policies, staleTime: 60_000 });

  const profileValues = useMemo(() => {
    const values: Record<string, unknown> = {};
    Object.entries(profile.data?.facts ?? {}).forEach(([field, fact]) => {
      const v = fact.value;
      const empty = v == null || v === "USER_INPUT_REQUIRED" || (Array.isArray(v) && v.length === 0) || v === "";
      if (!empty) values[field] = v;
    });
    return values;
  }, [profile.data]);

  const search = useMutation({
    mutationFn: () => {
      const boardList = boards.split(",").map((b) => b.trim()).filter(Boolean);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ keywords, location, boards, useProfile, questions }));
      return discoveryAPI.discover({
        keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
        location,
        boards: boardList,
        profile: useProfile && Object.keys(profileValues).length ? profileValues : undefined,
      });
    },
    onError: (e) => toast({ title: "Search failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  });

  const save = async (entry: DiscoveredJob) => {
    try {
      await jobAPI.saveJob({
        userId: userId!, jobId: entry.job.job_id, title: entry.job.title, company: entry.job.company,
        location: entry.job.location, platform: entry.job.source, url: entry.job.application_url,
        matchScore: entry.match?.match_score,
      });
      setDone((d) => ({ ...d, [entry.job.job_id]: d[entry.job.job_id] ?? "saved" }));
      toast({ title: "Saved", description: `${entry.job.title} at ${entry.job.company}` });
    } catch (e) {
      toast({ title: "Could not save", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const prepare = async (entry: DiscoveredJob) => {
    const provenance: Record<string, string> = {};
    Object.entries(profile.data?.facts ?? {}).forEach(([field, fact]) => {
      if (fact.provenance && field in profileValues) provenance[field] = fact.provenance;
    });
    setPreparing(entry.job.job_id);
    try {
      const pkg = await applicationAPI.buildPackage({
        profile: profileValues,
        job: entry.job,
        questions: questions.split("\n").map((q) => q.trim()).filter(Boolean),
        provenance,
      });
      if (pkg.decision === "DO_NOT_APPLY" || pkg.decision === "MISSING_INFORMATION") {
        toast({
          title: pkg.decision === "DO_NOT_APPLY" ? "JobGenie advises against this one" : "Your profile needs more first",
          description: pkg.decision_reasons[0],
          variant: "destructive",
        });
        return;
      }
      await applicationAPI.queue(userId!, pkg);
      toast({ title: "Ready for your review", description: "Open the Approval Center to review, edit and approve." });
      navigate("/approvals");
    } catch (e) {
      toast({ title: "Could not prepare the application", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setPreparing(null);
    }
  };

  const openAndLog = async (entry: DiscoveredJob) => {
    // Click-out: the application happens on the employer's own site, in the user's own browser.
    window.open(entry.job.application_url, "_blank", "noopener,noreferrer");
    try {
      await jobAPI.applyToJob(entry.job.job_id, String(userId), undefined, undefined, entry.job.source);
      setDone((d) => ({ ...d, [entry.job.job_id]: "applied" }));
      toast({ title: "Logged as applied", description: "Track it under History. Update the status as it progresses." });
    } catch (e) {
      toast({ title: "Opened the posting, but could not log it", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const result = search.data;
  const noProfile = useProfile && !profile.isLoading && Object.keys(profileValues).length === 0;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-bold">Discover jobs</h1>
          <p className="text-sm text-muted-foreground">
            Reads employers' own public job boards, removes duplicates, flags suspicious postings, and explains how each job fits your profile.
            You apply on the employer's site; JobGenie keeps the record.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="kw">Keywords</Label>
                <Input id="kw" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="java, spring boot, backend" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="loc">Location</Label>
                <Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Pune, Berlin, or Remote" />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="boards">Employer job boards</Label>
              <Input id="boards" value={boards} onChange={(e) => setBoards(e.target.value)} placeholder="greenhouse:stripe, lever:netflix, ashby:ramp" />
              <p className="text-xs text-muted-foreground">
                Format <code>platform:company-token</code>. The token is the last part of the company's careers URL
                (e.g. <code>boards.greenhouse.io/<b>stripe</b></code>). Supported: greenhouse, lever, ashby.
              </p>
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Screening questions JobGenie should answer from your profile</summary>
              <textarea
                className="mt-2 w-full rounded-md border bg-background p-2 text-sm"
                rows={5}
                value={questions}
                onChange={(e) => setQuestions(e.target.value)}
                aria-label="Screening questions, one per line"
              />
              <p className="text-xs text-muted-foreground">One per line. Anything your profile can't answer is left for you; nothing is guessed.</p>
            </details>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={useProfile} onChange={(e) => setUseProfile(e.target.checked)} />
                Match against my profile
              </label>
              <Button onClick={() => search.mutate()} disabled={search.isPending || !boards.trim()}>
                {search.isPending ? "Searching…" : "Search"}
              </Button>
            </div>
            {noProfile && (
              <p className="text-sm text-amber-700">
                Your profile is empty, so jobs can't be matched. <Link href="/candidate-profile" className="underline">Fill it in</Link> (or let JobGenie read your resume).
              </p>
            )}
          </CardContent>
        </Card>

        {result && (
          <>
            <div className="space-y-1 text-sm text-muted-foreground">
              <div>
                {result.total} job{result.total === 1 ? "" : "s"} found
                {result.duplicate_groups.length > 0 && ` · ${result.duplicate_groups.reduce((n, g) => n + g.duplicates.length, 0)} duplicate${result.duplicate_groups.length === 1 ? "" : "s"} merged`}
              </div>
              {result.errors.map((e) => <div key={e.platform} className="text-red-700">Could not read {e.platform}: {e.error}</div>)}
              {result.skipped.map((s) => <div key={s.platform} className="text-amber-700">Skipped {s.platform}: {s.reason}</div>)}
            </div>

            {result.jobs.map((entry) => {
              const { job, safety, match } = entry;
              const rec = match ? RECOMMENDATION[match.recommendation] : undefined;
              const risky = safety.level !== "LOW";
              const state = done[job.job_id];
              return (
                <Card key={job.job_id} className={safety.level === "HIGH" ? "border-red-300" : undefined}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-lg break-words">{job.title}</CardTitle>
                        <CardDescription>
                          {job.company}{job.location ? ` · ${job.location}` : ""}{job.remote_type !== "UNKNOWN" ? ` · ${job.remote_type.toLowerCase()}` : ""}
                          {money(job) ? ` · ${money(job)}` : ""}
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {match && rec && (
                          <Badge className={rec.className} title={`Confidence ${Math.round(match.confidence * 100)}% — based on how much of your profile and the posting had data`}>
                            {match.match_score}% · {rec.label}
                          </Badge>
                        )}
                        <Badge variant="outline">{job.ats_type ?? job.source}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {risky && (
                      <div className={`rounded border p-3 text-sm ${safety.level === "HIGH" ? "border-red-300 bg-red-50 text-red-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
                        <strong>{safety.level === "HIGH" ? "Likely a scam — don't share personal details or pay anything." : "Be careful with this posting."}</strong>
                        <ul className="mt-1 list-disc pl-5">{safety.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                      </div>
                    )}

                    {match && (
                      <div className="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          {match.strengths.map((s) => <div key={s} className="text-green-800">✓ {s}</div>)}
                        </div>
                        <div>
                          {match.weaknesses.map((w) => <div key={w} className="text-amber-800">• {w}</div>)}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      {safety.level !== "HIGH" && (
                        <Button size="sm" onClick={() => prepare(entry)} disabled={preparing === job.job_id || Object.keys(profileValues).length === 0}
                          title={Object.keys(profileValues).length === 0 ? "Fill in your profile first" : undefined}>
                          {preparing === job.job_id ? "Preparing…" : "Prepare application"}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => openAndLog(entry)} disabled={state === "applied"}>
                        {state === "applied" ? "Logged as applied" : safety.level === "HIGH" ? "Open anyway & log" : "Apply on site & log"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => save(entry)} disabled={!!state}>
                        {state === "saved" ? "Saved" : "Save"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setExpanded(expanded === job.job_id ? null : job.job_id)}>
                        {expanded === job.job_id ? "Hide details" : "Details"}
                      </Button>
                    </div>

                    {expanded === job.job_id && (
                      <div className="space-y-2 border-t pt-3 text-sm">
                        {match && (
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                            <span>Role: {match.career_fit}</span><span>Location: {match.location_fit}</span>
                            <span>Pay: {match.salary_fit}</span><span>Work authorization: {match.visa_fit.replace("_", " ")}</span>
                            <span>Checked with: {match.tiers_used.join(" → ")}</span>
                          </div>
                        )}
                        {match && match.missing_skills.length > 0 && (
                          <div className="flex flex-wrap gap-1">{match.missing_skills.map((s) => <Badge key={s} variant="outline">missing: {s}</Badge>)}</div>
                        )}
                        <p className="max-h-60 overflow-auto whitespace-pre-wrap text-xs">{job.description || "No description provided."}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Where JobGenie will and won't look</CardTitle>
            <CardDescription>
              Based on each platform's published terms. JobGenie does not scrape sites that forbid it, and never applies or messages on your behalf.
              {policies.data && (
                <> Automation is <strong>{policies.data.switches.globalAutomationEnabled ? "on" : "off"}</strong>; dry-run is <strong>{policies.data.switches.dryRun ? "on" : "off"}</strong>.</>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y text-sm">
            {(policies.data?.policies ?? []).map((p) => (
              <div key={p.platform} className="grid gap-1 py-2 sm:grid-cols-[120px_1fr]">
                <div className="font-medium capitalize">{p.platform}</div>
                <div className="text-muted-foreground">
                  Search: {MODE_LABEL[p.search] ?? p.search} · Apply: {MODE_LABEL[p.apply] ?? p.apply}
                  <div className="text-xs">{p.notes} <a className="underline" href={p.sourceUrl} target="_blank" rel="noopener noreferrer">terms</a></div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
