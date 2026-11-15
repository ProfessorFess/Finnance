"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="ghost"
      disabled={pending}
      className={cn("justify-start text-muted-foreground", className)}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        router.replace("/sign-in");
        router.refresh();
      }}
    >
      <LogOut /> Sign out
    </Button>
  );
}
