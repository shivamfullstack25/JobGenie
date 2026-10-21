import {useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Link} from "wouter";
import Navigation from "@/components/navigation";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {LoadingCard} from "@/components/ui/loading-spinner";
import {useAuth} from "@/context/AuthContext";
import {useToast} from "@/hooks/use-toast";
import {applicationAPI, jobAPI, type ApprovalRequestRow} from "@/lib/api";

const USER_INPUT_REQUIRED = "USER_INPUT_REQUIRED";

const DECISION_COPY: Record<string, { label: string; className: string }> = {
  APPLY_WITH_APPROVAL: { label: "Ready for your review", className: "bg-green-100 text-green-800 border-green-200" },
  SAVE_FOR_REVIEW: { label: "Worth a look", className: "bg-amber-100 text-amber-800 border-amber-200" },
  BLOCKED_BY_PLATFORM: { label: "You apply yourself on this site", className: "bg-gray-100 text-gray-800 border-gray-200" },
  APPLY_AUTOMATICALLY: { label: "Eligible for automation", className: "bg-blue-100 text-blue-800 border-blue-200" },
};

function Request({ row, userId, onChanged }: { row: ApprovalRequestRow; userId: number; onChanged: () => void }) {
  const { toast } = useToast();
  const pkg = row.packageData;
  const [letter, setLetter] = useState(pkg.cover_letter.text);
  const [message, setMessage] = useState(pkg.recruiter_message);
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(pkg.answers.map((a) => [a.question, a.answer === USER_INPUT_REQUIRED || a.answer == null ? "" : String(a.answer)])),
  );
  const [showResume, setShowResume] = useState(false);

  const unanswered = pkg.answers.filter((a) => !answers[a.question]?.trim());
  const failedChecks = pkg.checks.filter((c) => !c.passed);
  const decided = row.status === "APPROVED" || row.status === "REJECTED";
  const fail = (title: string) => (e: unknown) => toast({ title, description: e instanceof Error ? e.message : String(e), variant: "destructive" });

  const edits = () => ({
    coverLetterText: letter,
    recruiterMessage: message,
    answers: pkg.answers.filter((a) => answers[a.question]?.trim()).map((a) => ({ question: a.question, answer: answers[a.question].trim() })),
  });

  const decide = useMutation({
    mutationFn: async (action: "APPROVE" | "SAVE" | "REJECT" | "EDIT") => {
      // Anything typed is saved with the decision, so approving never discards an edit.
      if (action !== "REJECT" && action !== "EDIT" && !decided) await applicationAPI.decide(userId, row.id, "EDIT", edits());
      return applicationAPI.decide(userId, row.id, action, action === "EDIT" ? edits() : undefined);
    },
    onSuccess: (_r, action) => {
      onChanged();
      toast({ title: { APPROVE: "Approved", SAVE: "Saved for later", REJECT: "Rejected", EDIT: "Edits saved" }[action] });
    },
    onError: fail("Could not record your decision"),
  });

  const markSubmitted = useMutation({
    mutationFn: () => jobAPI.updateApplicationStatus(row.applicationId!, userId, "SUBMITTED"),
    onSuccess: () => { onChanged(); toast({ title: "Marked as applied", description: "Track it under History." }); },
    onError: fail("Could not update"),
  });

  return (
    <Card className={row.riskLevel === "HIGH" ? "border-red-300" : undefined}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-lg break-words">{row.jobTitle}</CardTitle>
            <CardDescription>{row.company}{row.location ? ` · ${row.location}` : ""} · via {row.source}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {row.matchScore != null && <Badge variant="outline">{row.matchScore}% match</Badge>}
            {row.riskLevel && row.riskLevel !== "LOW" && <Badge className="bg-amber-100 text-amber-800 border-amber-200">Risk: {row.riskLevel.toLowerCase()}</Badge>}
            <Badge className={DECISION_COPY[row.decision]?.className}>{DECISION_COPY[row.decision]?.label ?? row.decision}</Badge>
            {row.editedByUser && <Badge variant="outline">edited by you</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {pkg.decision_reasons.map((r) => <p key={r} className="text-sm text-muted-foreground">{r}</p>)}

        <div className="grid gap-1 text-sm">
          {pkg.checks.map((c) => (
            <div key={c.name} className={c.passed ? "text-green-800" : "text-red-700"}>
              {c.passed ? "✓" : "✗"} {c.name}{!c.passed && c.detail ? ` — ${c.detail}` : ""}
            </div>
          ))}
        </div>

        {pkg.needs_confirmation.length > 0 && (
          <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Built partly from details you haven't confirmed yet ({pkg.needs_confirmation.join(", ")}).{" "}
            <Link href="/candidate-profile" className="underline">Confirm them on My Profile</Link>.
          </p>
        )}

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Resume — tailored as "{pkg.preset.preset.replace(/_/g, " ")}"</label>
            <Button size="sm" variant="ghost" onClick={() => setShowResume((v) => !v)}>{showResume ? "Hide" : "Show"}</Button>
          </div>
          {showResume && <pre className="max-h-72 overflow-auto rounded bg-muted p-3 text-xs whitespace-pre-wrap">{pkg.resume.text}</pre>}
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor={`cl-${row.id}`}>Cover letter</label>
          <Textarea id={`cl-${row.id}`} rows={9} value={letter} onChange={(e) => setLetter(e.target.value)} disabled={decided} />
        </div>

        {pkg.answers.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm font-medium">Application questions</div>
            {pkg.answers.map((a) => (
              <div key={a.question} className="space-y-1">
                <label className="text-sm">{a.question}</label>
                <Input
                  value={answers[a.question] ?? ""}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [a.question]: e.target.value }))}
                  placeholder={a.status === "DRAFT_ONLY" ? "Write this in your own words" : "Needs your answer"}
                  disabled={decided}
                />
                <p className="text-xs text-muted-foreground">
                  {a.status === "FILLED"
                    ? `From your profile (${a.source})${a.requires_approval ? " — check it" : ""}.`
                    : a.note}
                </p>
                {a.evidence && a.evidence.length > 0 && (
                  <ul className="list-disc pl-5 text-xs text-muted-foreground">{a.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor={`rm-${row.id}`}>Message to the recruiter (optional)</label>
          <Input id={`rm-${row.id}`} value={message} onChange={(e) => setMessage(e.target.value)} disabled={decided} />
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-3">
          {!decided && (
            <>
              <Button onClick={() => decide.mutate("APPROVE")} disabled={decide.isPending || failedChecks.length > 0 || unanswered.length > 0}
                title={unanswered.length ? "Answer every question first" : failedChecks.length ? "A check failed" : undefined}>
                Approve
              </Button>
              <Button variant="outline" onClick={() => decide.mutate("EDIT")} disabled={decide.isPending}>Save edits</Button>
              {row.status !== "SAVED" && <Button variant="outline" onClick={() => decide.mutate("SAVE")} disabled={decide.isPending}>Save for later</Button>}
              <Button variant="ghost" onClick={() => decide.mutate("REJECT")} disabled={decide.isPending}>Reject</Button>
            </>
          )}
          <Button variant="outline" onClick={() => window.open(row.applicationUrl, "_blank", "noopener,noreferrer")}>Open posting</Button>
          {row.status === "APPROVED" && row.applicationId && (
            <Button onClick={() => markSubmitted.mutate()} disabled={markSubmitted.isPending}>I've applied</Button>
          )}
        </div>
        {!decided && unanswered.length > 0 && <p className="text-xs text-muted-foreground">{unanswered.length} question(s) still need your answer before you can approve.</p>}
        {row.status === "APPROVED" && (
          <p className="text-xs text-muted-foreground">
            Approved. JobGenie doesn't submit applications: open the posting, apply there with the text above, then click "I've applied".
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Approvals() {
  const { backendUser, loading } = useAuth();
  const queryClient = useQueryClient();
  const userId = backendUser?.id;
  const [tab, setTab] = useState<"PENDING" | "APPROVED" | "SAVED" | "REJECTED">("PENDING");

  const queue = useQuery({
    queryKey: ["approvals", userId],
    queryFn: () => applicationAPI.list(userId!),
    enabled: !!userId,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["approvals", userId] });

  if (loading || queue.isLoading) {
    return <div className="min-h-screen bg-background"><Navigation /><div className="mx-auto max-w-4xl p-6"><LoadingCard /></div></div>;
  }

  const rows = (queue.data ?? []).filter((r) => r.status === tab);
  const count = (s: string) => (queue.data ?? []).filter((r) => r.status === s).length;
  const tabs: [typeof tab, string][] = [["PENDING", "To review"], ["APPROVED", "Approved"], ["SAVED", "Saved"], ["REJECTED", "Rejected"]];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-bold">Approval Center</h1>
          <p className="text-sm text-muted-foreground">
            Everything JobGenie prepares waits here for you. Nothing is sent anywhere until you apply yourself on the employer's site.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tabs.map(([key, label]) => (
            <Button key={key} size="sm" variant={tab === key ? "default" : "outline"} onClick={() => setTab(key)}>{label} ({count(key)})</Button>
          ))}
        </div>
        {queue.isError ? <p className="text-sm text-red-700">{(queue.error as Error).message}</p> : null}
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing here. Find a job on <Link href="/job-discovery" className="underline">Discover</Link> and choose "Prepare application".
          </p>
        )}
        {rows.map((row) => <Request key={`${row.id}-${row.status}-${row.editedByUser}`} row={row} userId={userId!} onChanged={refresh} />)}
      </main>
    </div>
  );
}
