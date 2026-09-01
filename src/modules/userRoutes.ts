import { Router, Request, Response } from 'express';

export function createUserRoutes(users: Record<string, { password?: string; role: string; fullName: string }>) {
  const router = Router();

  router.get('/users', (_req: Request, res: Response) => {
    res.json(
      Object.entries(users).map(([username, user]) => ({
        username,
        role: user.role,
        fullName: user.fullName
      }))
    );
  });

  router.get('/users/:username', (req: Request, res: Response) => {
    const rawUsername = req.params.username;
    const username = Array.isArray(rawUsername) ? rawUsername[0] : rawUsername;
    const user = username ? users[username] : undefined;

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      username,
      role: user.role,
      fullName: user.fullName
    });
  });

  return router;
}
