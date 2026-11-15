const TOO_MANY = "Too many attempts. Try again in a minute.";

/** Message for a failed email/password sign-in. Only a 401 means the credentials were wrong. */
export function signInErrorMessage(status: number | undefined): string {
  if (status === 401) return "Invalid email or password.";
  if (status === 429) return TOO_MANY;
  return "Something went wrong signing in. Please try again.";
}

/** Message for a failed two-factor or backup code. */
export function codeErrorMessage(status: number | undefined): string {
  if (status === 401) return "That code didn't work. Try again.";
  if (status === 429) return TOO_MANY;
  return "Something went wrong. Please try again.";
}
