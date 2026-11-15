"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
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
    <div className="w-full max-w-sm">
      <h1 className="mb-6 text-2xl font-semibold">Sign in to Finnance</h1>
      {step === "password" ? (
        <form onSubmit={onPassword} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" required className="rounded border px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1">
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="rounded border px-3 py-2"
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={pending} className="rounded bg-black px-3 py-2 text-white">
            Sign in
          </button>
        </form>
      ) : (
        <form onSubmit={onCode} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span>{step === "totp" ? "Authentication code" : "Backup code"}</span>
            <input
              name="code"
              inputMode={step === "totp" ? "numeric" : "text"}
              autoComplete="one-time-code"
              required
              autoFocus
              className="rounded border px-3 py-2"
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={pending} className="rounded bg-black px-3 py-2 text-white">
            Verify
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep(step === "totp" ? "backup" : "totp");
            }}
            className="text-sm underline"
          >
            {step === "totp" ? "Use a backup code" : "Use your authenticator app"}
          </button>
        </form>
      )}
    </div>
  );
}
