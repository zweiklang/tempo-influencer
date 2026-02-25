// Load config first (sets up env and ENCRYPTION_SALT)
import './config';

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import * as path from 'path';
import * as fs from 'fs';
import { PORT, NODE_ENV } from './config';
import { initDb } from './db';

import settingsRouter from './routes/settings';
import projectRouter from './routes/project';
import teamRouter from './routes/team';
import issuesRouter from './routes/issues';
import budgetDeltaRouter from './routes/budget-delta';

// Initialize database (runs migrations)
initDb();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Helper HOF for async route error handling
export function tryCatch(
  fn: (req: Request, res: Response) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

// API Routes
app.use('/api/settings', settingsRouter);
app.use('/api/project', projectRouter);
app.use('/api/team', teamRouter);
app.use('/api/issues', issuesRouter);
app.use('/api/budget-delta', budgetDeltaRouter);

// Serve client in production
if (NODE_ENV === 'production') {
  const clientDistPath = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  }
}

// Global error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error]', err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  const status =
    err instanceof Error && 'status' in err && typeof (err as { status: unknown }).status === 'number'
      ? (err as { status: number }).status
      : 500;
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
