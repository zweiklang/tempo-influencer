import { Request, Response, NextFunction } from 'express';

export function tryCatch(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch((err: unknown) => {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Internal error';
      const details =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: unknown } }).response?.data
          : undefined;
      res.status(500).json({ error: message, ...(details ? { details } : {}) });
    });
  };
}
