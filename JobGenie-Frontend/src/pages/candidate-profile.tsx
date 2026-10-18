import {useRef, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import Navigation from "@/components/navigation";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {LoadingCard} from "@/components/ui/loading-spinner";
import {useAuth} from "@/context/AuthContext";
import {useToast} from "@/hooks/use-toast";
import {profileAPI, resumeAgentAPI, type ProfileFact, type Provenance, type TailoredResume} from "@/lib/api";

const USER_INPUT_REQUIRED = "USER_INPUT_REQUIRED";

const SECTIONS: { title: string; hint: string; fields: string[] }[] = [
  { title: "Identity", hint: "Who you are", fields: ["identity.fullName", "identity.headline", "identity.summary"] },
  { title: "Contact & location", hint: "How employers reach you", fields: ["contact.email", "contact.phone", "location.current", "location.country"] },
  { title: "Work authorization", hint: "Per country you want to work in", fields: ["workAuthorization.status", "workAuthorization.visa"] },
  {
    title: "Career preferences",
    hint: "What you are looking for",
    fields: [
      "preferences.targetRoles", "preferences.targetLocations", "preferences.salaryExpectation",
      "preferences.noticePeriod", "preferences.remotePreference", "preferences.willingToRelocate",
    ],
  },
  { title: "Experience & education", hint: "Your history", fields: ["experience", "education", "certifications", "projects", "achievements"] },
  { title: "Skills", hint: "What you can do", fields: ["skills"] },
  {
    title: "Profiles & links",
    hint: "Where you appear elsewhere. These never overwrite this profile.",
    fields: [
      "links.portfolio", "links.github", "links.linkedin", "links.naukri",
      "links.cutshort", "links.instahyre", "links.wellfound", "links.other",
    ],
  },
];

// Lists of plain strings are edited as comma-separated text; everything else as JSON.
const STRING_LISTS = new Set(["skills", "preferences.targetRoles", "preferences.targetLocations", "links.other"]);

const PROVENANCE_STYLE: Record<Provenance, { label: string; className: string; tip: string }> = {
  FACT: { label: "You stated", className: "bg-green-100 text-green-800 border-green-200", tip: "You entered this yourself." },
  USER_APPROVED: { label: "You approved", className: "bg-emerald-100 text-emerald-800 border-emerald-200", tip: "Suggested by JobGenie, confirmed by you." },
  INFERRED: { label: "Inferred", className: "bg-amber-100 text-amber-800 border-amber-200", tip: "Read from a document. Not yet confirmed by you." },
  AI_GENERATED: { label: "AI-written", className: "bg-purple-100 text-purple-800 border-purple-200", tip: "Written by an AI model. Not yet confirmed by you." },
};

function labelFor(field: string) {
  const last = field.split(".").pop() ?? field;
  return last.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function isMissing(value: unknown) {
  return (
    value === null || value === undefined || value === USER_INPUT_REQUIRED ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0)
  );
}

function toEditText(field: string, value: unknown): string {
  if (isMissing(value)) return "";
  if (STRING_LISTS.has(field) && Array.isArray(value)) return value.join(", ");
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function fromEditText(field: string, kind: string | undefined, text: string): unknown {
  const trimmed = text.trim();
  if (kind === "LIST" && STRING_LISTS.has(field)) {
    return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (kind === "LIST" || kind === "OBJECT") return JSON.parse(trimmed || (kind === "LIST" ? "[]" : "{}"));
  return trimmed;
}

function ValueView({ value }: { value: unknown }) {
  if (isMissing(value)) return <span className="text-sm italic text-muted-foreground">Not provided</span>;
  if (typeof value === "string") return <span className="text-sm break-words">{value}</span>;
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return (
      <div className="flex flex-wrap gap-1">
        {value.map((v) => <Badge key={v} variant="outline">{v}</Badge>)}
      </div>
    );
  }
  return (
    <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function CandidateProfilePage() {
  const { backendUser, loading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const userId = backendUser?.id;
  const fileInput = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [preset, setPreset] = useState("software_engineer");
  const [jobDescription, setJobDescription] = useState("");
  const [tailored, setTailored] = useState<TailoredResume | null>(null);

  const profile = useQuery({
    queryKey: ["candidate-profile", userId],
    queryFn: () => profileAPI.get(userId!),
    enabled: !!userId,
  });
  const schema = useQuery({ queryKey: ["candidate-profile-schema"], queryFn: profileAPI.schema, staleTime: Infinity });
  const proposals = useQuery({
    queryKey: ["candidate-profile-proposals", userId],
    queryFn: () => profileAPI.proposals(userId!),
    enabled: !!userId,
  });
  const versions = useQuery({
    queryKey: ["candidate-profile-versions", userId],
    queryFn: () => profileAPI.versions(userId!),
    enabled: !!userId,
  });

  const presets = useQuery({ queryKey: ["resume-presets"], queryFn: resumeAgentAPI.presets, staleTime: Infinity });

  const tailor = useMutation({
    mutationFn: () => {
      const values: Record<string, unknown> = {};
      const provenance: Record<string, string> = {};
      Object.entries(profile.data?.facts ?? {}).forEach(([field, fact]) => {
        if (!isMissing(fact.value)) {
          values[field] = fact.value;
          if (fact.provenance) provenance[field] = fact.provenance;
        }
      });
      return resumeAgentAPI.tailor(values, preset, jobDescription, provenance);
    },
    onSuccess: setTailored,
    onError: (e) => toast({ title: "Could not tailor the resume", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  });

  const downloadResume = () => {
    if (!tailored) return;
    const url = URL.createObjectURL(new Blob([tailored.text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `resume-${tailored.document.preset}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["candidate-profile", userId] });
    queryClient.invalidateQueries({ queryKey: ["candidate-profile-proposals", userId] });
    queryClient.invalidateQueries({ queryKey: ["candidate-profile-versions", userId] });
  };
  const fail = (title: string) => (e: unknown) =>
    toast({ title, description: e instanceof Error ? e.message : String(e), variant: "destructive" });

  const save = useMutation({
    mutationFn: ({ field, value }: { field: string; value: unknown }) => profileAPI.setField(userId!, field, value),
    onSuccess: () => { setEditing(null); refresh(); toast({ title: "Saved", description: "Recorded as a fact you stated." }); },
    onError: fail("Could not save"),
  });
  const approve = useMutation({
    mutationFn: (field: string) => profileAPI.approveField(userId!, field),
    onSuccess: () => { refresh(); toast({ title: "Approved" }); },
    onError: fail("Could not approve"),
  });
  const decide = useMutation({
    mutationFn: ({ id, ok }: { id: number; ok: boolean }) => profileAPI.decideProposal(userId!, id, ok),
    onSuccess: refresh,
    onError: fail("Could not update the proposal"),
  });
  const rollback = useMutation({
    mutationFn: (version: number) => profileAPI.rollback(userId!, version),
    onSuccess: (r) => { refresh(); toast({ title: "Rolled back", description: `Profile is now version ${r.currentVersion}.` }); },
    onError: fail("Could not roll back"),
  });
  const importResume = useMutation({
    mutationFn: () => profileAPI.importResume(userId!),
    onSuccess: (r) => {
      refresh();
      toast({
        title: "Resume read",
        description: `${r.applied} recorded as inferred, ${r.proposed} conflict${r.proposed === 1 ? "" : "s"} for you to review.`,
      });
    },
    onError: fail("Could not read your resume"),
  });
  const importYaml = useMutation({
    mutationFn: ({ yaml, confirm }: { yaml: string; confirm: boolean }) => profileAPI.importYaml(userId!, yaml, confirm),
    onSuccess: (r) => {
      refresh();
      toast({
        title: r.errors.length ? "Imported with problems" : "Imported",
        description: r.errors.length ? r.errors.slice(0, 3).join("; ") : `${r.applied} applied, ${r.proposed} to review.`,
        variant: r.errors.length ? "destructive" : "default",
      });
    },
    onError: fail("Could not import"),
  });

  const downloadYaml = async () => {
    try {
      const yaml = await profileAPI.exportYaml(userId!);
      const url = URL.createObjectURL(new Blob([yaml], { type: "application/x-yaml" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "master-profile.yaml";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      fail("Could not export")(e);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const yaml = await file.text();
    const confirm = window.confirm(
      "Is this file your own statement of these facts?\n\nOK: record its values as facts you stated.\nCancel: record them as inferred, to review and approve yourself.",
    );
    importYaml.mutate({ yaml, confirm });
    if (fileInput.current) fileInput.current.value = "";
  };

  const startEdit = (field: string, fact?: ProfileFact) => {
    setEditing(field);
    setDraft(toEditText(field, fact?.value));
  };
  const submitEdit = (field: string) => {
    try {
      const value = fromEditText(field, schema.data?.fields[field], draft);
      if (isMissing(value)) {
        toast({ title: "Nothing to save", description: "Enter a value, or cancel.", variant: "destructive" });
        return;
      }
      save.mutate({ field, value });
    } catch {
      toast({ title: "That is not valid JSON", description: "Check the brackets and quotes.", variant: "destructive" });
    }
  };

  if (loading || profile.isLoading) {
    return <div className="min-h-screen bg-background"><Navigation /><div className="mx-auto max-w-5xl p-6"><LoadingCard /></div></div>;
  }
  if (!userId) {
    return <div className="min-h-screen bg-background"><Navigation /><div className="mx-auto max-w-5xl p-6">Sign in to see your profile.</div></div>;
  }

  const view = profile.data;
  const kinds = schema.data?.fields ?? {};

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Candidate profile</h1>
            <p className="text-sm text-muted-foreground">
              The single source your resumes, cover letters and application answers are built from.
              JobGenie never turns a guess into a fact: anything it works out stays marked until you approve it.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => importResume.mutate()} disabled={importResume.isPending}>
              {importResume.isPending ? "Reading…" : "Fill from my resume"}
            </Button>
            <Button variant="outline" onClick={downloadYaml}>Export YAML</Button>
            <Button variant="outline" onClick={() => fileInput.current?.click()}>Import YAML</Button>
            <input ref={fileInput} type="file" accept=".yaml,.yml,text/yaml" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
        </div>

        {view && view.missingRequired.length > 0 && (
          <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="p-4 text-sm">
              <strong>Still needed before JobGenie can prepare applications:</strong>{" "}
              {view.missingRequired.map(labelFor).join(", ")}. JobGenie will leave these blank rather than guess.
            </CardContent>
          </Card>
        )}

        {(proposals.data?.length ?? 0) > 0 && (
          <Card className="border-blue-300">
            <CardHeader>
              <CardTitle>Suggested changes to things you stated</CardTitle>
              <CardDescription>Nothing changes until you approve.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {proposals.data!.map((p) => (
                <div key={p.id} className="rounded border p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-medium">{labelFor(p.field)}</span>
                    <Badge variant="outline">from {p.source}</Badge>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><div className="mb-1 text-xs text-muted-foreground">Currently</div><ValueView value={p.currentValue} /></div>
                    <div><div className="mb-1 text-xs text-muted-foreground">Suggested</div><ValueView value={p.proposedValue} /></div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={() => decide.mutate({ id: p.id, ok: true })}>Use suggestion</Button>
                    <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: p.id, ok: false })}>Keep mine</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {SECTIONS.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle className="text-lg">{section.title}</CardTitle>
              <CardDescription>{section.hint}</CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {section.fields.map((field) => {
                const fact = view?.facts[field];
                const style = fact?.provenance ? PROVENANCE_STYLE[fact.provenance] : undefined;
                const unvouched = fact?.provenance === "INFERRED" || fact?.provenance === "AI_GENERATED";
                const kind = kinds[field];
                return (
                  <div key={field} className="grid gap-2 py-3 sm:grid-cols-[180px_1fr_auto]">
                    <div className="text-sm font-medium">{labelFor(field)}</div>
                    <div className="min-w-0">
                      {editing === field ? (
                        <div className="space-y-2">
                          {kind === "SCALAR" ? (
                            <Input value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
                          ) : (
                            <>
                              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={8} className="font-mono text-xs" />
                              <p className="text-xs text-muted-foreground">
                                {STRING_LISTS.has(field) ? "Separate items with commas." : "Enter JSON."}
                              </p>
                            </>
                          )}
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => submitEdit(field)} disabled={save.isPending}>Save</Button>
                            <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <ValueView value={fact?.value} />
                          {style && !isMissing(fact?.value) && (
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <Badge className={style.className} title={style.tip}>{style.label}</Badge>
                              {fact?.source && <span>source: {fact.source}</span>}
                              {typeof fact?.confidence === "number" && unvouched && <span>confidence {Math.round(fact.confidence * 100)}%</span>}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {editing !== field && (
                      <div className="flex gap-2 sm:justify-end">
                        {unvouched && !isMissing(fact?.value) && (
                          <Button size="sm" variant="outline" onClick={() => approve.mutate(field)}>Confirm</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => startEdit(field, fact)}>Edit</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Tailored resume</CardTitle>
            <CardDescription>
              Built only from the facts above. JobGenie reorders and selects for the role — it never adds an
              employer, title, date, skill or number you have not provided.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
                aria-label="Target role"
              >
                {(presets.data ?? [{ id: "software_engineer", label: "Software Engineer" }]).map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              <Button onClick={() => tailor.mutate()} disabled={tailor.isPending}>
                {tailor.isPending ? "Building…" : "Build resume"}
              </Button>
              {tailored && <Button variant="outline" onClick={downloadResume}>Download .txt</Button>}
            </div>
            <Textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={3}
              placeholder="Optional: paste a job description to put the most relevant skills and achievements first."
            />
            {tailored && (
              <div className="space-y-2">
                {tailored.document.missing.length > 0 && (
                  <p className="text-sm text-amber-700">
                    Missing from your profile, so left out: {tailored.document.missing.map(labelFor).join(", ")}.
                  </p>
                )}
                {tailored.document.unverified_fields.length > 0 && (
                  <p className="text-sm text-amber-700">
                    Includes details you have not confirmed yet: {tailored.document.unverified_fields.map(labelFor).join(", ")}.
                  </p>
                )}
                {tailored.document.violations.length > 0 && (
                  <p className="text-sm text-red-700">
                    Internal check failed — do not use this draft: {tailored.document.violations.join("; ")}
                  </p>
                )}
                <pre className="max-h-96 overflow-auto rounded bg-muted p-3 text-xs whitespace-pre-wrap">{tailored.text}</pre>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Version history</CardTitle>
            <CardDescription>Every change is kept. Rolling back adds a new version; nothing is erased.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {(versions.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No changes yet.</p>}
            {(versions.data ?? []).map((v) => (
              <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <span className="font-medium">v{v.version}</span>
                  {v.version === view?.version && <Badge className="ml-2" variant="outline">current</Badge>}
                  <span className="ml-3 text-muted-foreground">{v.reason ?? "Changed"} · {v.author} · {new Date(v.createdAt).toLocaleString()}</span>
                </div>
                {v.version !== view?.version && (
                  <Button size="sm" variant="outline" onClick={() => rollback.mutate(v.version)} disabled={rollback.isPending}>
                    Restore this version
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
