import type { NextFunction, Request, Response } from 'express';

// Honours a status set on the error (e.g. express.static's 404 for a missing
// file, or anything that throws an object with .status/.statusCode); otherwise
// it's an unexpected server error.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const status =
    (typeof err === 'object' && err !== null && (('status' in err && Number((err as { status: unknown }).status)) ||
      ('statusCode' in err && Number((err as { statusCode: unknown }).statusCode)))) || 500;

  if (status >= 500) console.error(err);
  const message = status < 500 && err instanceof Error ? err.message : 'Unexpected error';
  res.status(status).json({ error: message });
}
