/** The record doesn't exist or doesn't belong to this user (deliberately indistinguishable). */
export class NotFoundError extends Error {
  constructor(what = "Record") {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

/** Invalid user input with a message safe to show in the UI. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
