"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

type Step = "password" | "totp" | "backup";

const INVALID = "Invalid email or password.";
const TOO_MANY = "Too many attempts. Try again in a minute.";

function messageFor(error: { status?: number; message?: string } | null, fallback: string) {
  if (!error) return null;
  return error.status === 429 ? TOO_MANY : fallback;
}

export function SignInForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("password");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const done = () => {
    router.replace(nextPath);
    router.refresh();
  };

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const { data, error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setPending(false);
    if (error) return setError(messageFor(error, INVALID));
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) return setStep("totp");
    done();
  }

  async function onCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "");
    setPending(true);
    setError(null);
    const { error } =
      step === "totp"
        ? await authClient.twoFactor.verifyTotp({ code })
        : await authClient.twoFactor.verifyBackupCode({ code });
    setPending(false);
    if (error) return setError(messageFor(error, "That code didn't work. Try again."));
    done();
  }

  return (
    <div className="rise relative z-10 w-full max-w-sm">
      <div className="mb-10 flex justify-center">
        <Wordmark />
      </div>
      <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold">{step === "password" ? "Welcome back" : "Two-step verification"}</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          {step === "password"
            ? "Sign in to your private dashboard."
            : step === "totp"
              ? "Enter the 6-digit code from your authenticator app."
              : "Enter one of your saved backup codes."}
        </p>
        {step === "password" ? (
          <form onSubmit={onPassword} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required className="h-10" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="h-10"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={pending} className="mt-2 h-10">
              Sign in
            </Button>
          </form>
        ) : (
          <form onSubmit={onCode} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code">{step === "totp" ? "Authentication code" : "Backup code"}</Label>
              <Input
                id="code"
                name="code"
                inputMode={step === "totp" ? "numeric" : "text"}
                autoComplete="one-time-code"
                required
                autoFocus
                className="num h-11 text-center text-lg tracking-[0.3em]"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={pending} className="h-10">
              Verify
            </Button>
            <Button
              type="button"
              variant="link"
              onClick={() => {
                setError(null);
                setStep(step === "totp" ? "backup" : "totp");
              }}
            >
              {step === "totp" ? "Use a backup code" : "Use your authenticator app"}
            </Button>
          </form>
        )}
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">Private · Signup is closed</p>
    </div>
  );
}
