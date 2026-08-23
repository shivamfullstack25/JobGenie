import { useState } from "react";
import { sendEmailVerification } from "firebase/auth";
import { AlertTriangle, MailCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface EmailVerificationBannerProps {
  /** Override the default explanation, e.g. to name the specific feature being gated. */
  message?: string;
  className?: string;
}

/**
 * Persistent notice shown wherever an unverified account can see (but shouldn't yet use) a
 * gated feature like job applications or automation. Renders nothing once the backend user is
 * verified or not loaded, so it's safe to drop into any page unconditionally.
 */
export default function EmailVerificationBanner({
  message,
  className,
}: EmailVerificationBannerProps) {
  const { firebaseUser, backendUser } = useAuth();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  if (!backendUser || backendUser.isEmailVerified) {
    return null;
  }

  const handleResend = async () => {
    if (!firebaseUser) return;
    setSending(true);
    try {
      await sendEmailVerification(firebaseUser);
      toast({
        title: "Verification email sent",
        description: `Check ${backendUser.email} for a link to verify your account.`,
      });
    } catch (error: any) {
      toast({
        title: "Could not send verification email",
        description: error?.message || "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Alert
      className={`mb-6 border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300 ${className || ""}`}
    >
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertTitle>Verify your email</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>
          {message ||
            "Please verify your email address to use this feature. Basic account access and browsing stay available either way."}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleResend}
          disabled={sending}
          className="shrink-0 border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-200 dark:hover:bg-amber-900/40"
        >
          <MailCheck className="mr-2 h-4 w-4" />
          {sending ? "Sending..." : "Resend verification email"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
