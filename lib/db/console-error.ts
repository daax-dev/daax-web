/**
 * Error type for the admin DB console (brain2daax F6, #102), carrying the HTTP
 * status the API layer should surface. Kept in its own module so both
 * `console.ts` and `console-audit.ts` can throw it without a circular import.
 */
export class ConsoleError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ConsoleError";
    this.status = status;
  }
}
