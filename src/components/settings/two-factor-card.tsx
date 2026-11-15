"use client";

import { Copy, Download, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import QRCode from "react-qr-code";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

type PasswordAction = "enable" | "disable" | "regenerate";
type Stage = { kind: "idle" } | { kind: "scan"; totpURI: string; backupCodes: string[] } | { kind: "codes"; codes: string[] };

const ACTION_COPY: Record<PasswordAction, { title: string; description: string }> = {
  enable: { title: "Confirm your password", description: "To set up two-factor authentication, enter your password." },
  disable: { title: "Turn off two-factor authentication", description: "Enter your password to turn it off." },
  regenerate: {
    title: "Regenerate backup codes",
    description: "Your old backup codes will stop working. Enter your password to continue.",
  },
};

function groupSecret(uri: string) {
  const secret = new URL(uri).searchParams.get("secret") ?? "";
  return secret.match(/.{1,4}/g)?.join(" ") ?? secret;
}

export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [action, setAction] = useState<PasswordAction | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("password"));
    setPending(true);
    setError(null);
    try {
      if (action === "enable") {
        const { data, error } = await authClient.twoFactor.enable({ password });
        if (error || !data || !("totpURI" in data)) throw new Error(error?.message);
        setStage({ kind: "scan", totpURI: data.totpURI, backupCodes: data.backupCodes });
      } else if (action === "disable") {
        const { error } = await authClient.twoFactor.disable({ password });
        if (error) throw new Error(error.message);
        toast.success("Two-factor authentication is off");
        router.refresh();
      } else if (action === "regenerate") {
        const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
        if (error || !data) throw new Error(error?.message);
        setSaved(false);
        setStage({ kind: "codes", codes: data.backupCodes });
      }
      setAction(null);
    } catch {
      setError("That password didn't work. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function onVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (stage.kind !== "scan") return;
    const code = String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "");
    setPending(true);
    setError(null);
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (error) return setError("That code didn't work. Check your app and try again.");
    setSaved(false);
    setStage({ kind: "codes", codes: stage.backupCodes });
  }

  function finish() {
    setStage({ kind: "idle" });
    router.refresh();
  }

  const codesText = stage.kind === "codes" ? stage.codes.join("\n") : "";

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-xs sm:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div
          className={
            enabled
              ? "grid size-11 shrink-0 place-items-center rounded-xl bg-positive/12 text-positive"
              : "grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"
          }
        >
          {enabled ? <ShieldCheck className="size-5" /> : <ShieldOff className="size-5" />}
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold">Two-factor authentication</h2>
          {enabled ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Two-factor authentication is on. Signing in needs your password and a code from your authenticator app.
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Add a second step to sign-in using an authenticator app (like 1Password, Google Authenticator, or
              Authy). Strongly recommended for your financial data.
            </p>
          )}

          {stage.kind === "idle" && (
            <div className="mt-5 flex flex-wrap gap-2">
              {enabled ? (
                <>
                  <Button variant="outline" onClick={() => setAction("regenerate")}>
                    <KeyRound /> Regenerate backup codes
                  </Button>
                  <Button variant="ghost" className="text-destructive" onClick={() => setAction("disable")}>
                    Turn off
                  </Button>
                </>
              ) : (
                <Button onClick={() => setAction("enable")}>Enable two-factor authentication</Button>
              )}
            </div>
          )}

          {stage.kind === "scan" && (
            <div className="mt-6 grid gap-6 border-t pt-6 md:grid-cols-[auto_1fr]">
              <div className="w-fit rounded-xl border bg-white p-3">
                <QRCode value={stage.totpURI} size={164} />
              </div>
              <form onSubmit={onVerify} className="flex flex-col gap-4">
                <div>
                  <p className="text-sm font-medium">1. Scan the QR code with your authenticator app</p>
                  <p className="mt-1 text-sm text-muted-foreground">Or enter this key by hand:</p>
                  <code data-testid="totp-secret" className="num mt-2 block rounded-lg bg-muted px-3 py-2 text-sm break-all">
                    {groupSecret(stage.totpURI)}
                  </code>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="totp-code">2. Authentication code</Label>
                  <Input
                    id="totp-code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    className="num h-10 max-w-48 tracking-[0.3em]"
                  />
                </div>
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button type="submit" disabled={pending}>
                    Verify
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setStage({ kind: "idle" })}>
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          )}

          {stage.kind === "codes" && (
            <div className="mt-6 border-t pt-6">
              <p className="text-sm font-medium">Save your backup codes</p>
              <p className="mt-1 text-sm text-muted-foreground">
                If you lose your phone, each code lets you sign in once. They won&apos;t be shown again, so store them
                somewhere safe, like a password manager.
              </p>
              <ul
                data-testid="backup-codes"
                className="num mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-xl bg-muted px-5 py-4 font-mono text-sm sm:w-fit"
              >
                {stage.codes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(codesText);
                    toast.success("Backup codes copied");
                  }}
                >
                  <Copy /> Copy
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const url = URL.createObjectURL(new Blob([codesText + "\n"], { type: "text/plain" }));
                    const a = Object.assign(document.createElement("a"), {
                      href: url,
                      download: "finnance-backup-codes.txt",
                    });
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download /> Download .txt
                </Button>
              </div>
              <label className="mt-5 flex items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={saved}
                  onChange={(e) => setSaved(e.target.checked)}
                  className="size-4 accent-[var(--primary)]"
                />
                I&apos;ve saved these codes
              </label>
              <Button className="mt-4" disabled={!saved} onClick={finish}>
                Done
              </Button>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAction(null);
            setError(null);
          }
        }}
      >
        <DialogContent>
          {action && (
            <form onSubmit={onPassword} className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>{ACTION_COPY[action].title}</DialogTitle>
                <DialogDescription>{ACTION_COPY[action].description}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm-password">Password</Label>
                <Input
                  id="confirm-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  autoFocus
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button type="submit" disabled={pending} variant={action === "disable" ? "destructive" : "default"}>
                  {action === "disable" ? "Turn off" : "Continue"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
