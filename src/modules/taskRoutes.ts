import { Router, Request, Response } from 'express';
import { listItems, createItem, updateItem, removeItem, DatabaseInstance } from '../database';

export function createTaskRoutes(db: DatabaseInstance) {
  const router = Router();

  const handleListItems = async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const userId = user?.role === 'admin' ? undefined : (user?.id || user?.username);
      const items = await listItems(db, userId);
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  };

  const handleGetItem = async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const userId = user?.role === 'admin' ? undefined : (user?.id || user?.username);
      const items = await listItems(db, userId);
      const item = items.find((entry) => entry.id === Number(req.params.id));

      if (!item) {
        res.status(404).json({ error: 'Item not found' });
        return;
      }

      res.json(item);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  };

  const handleCreateItem = async (req: Request, res: Response) => {
    const { name, done = false } = req.body ?? {};

    if (typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    try {
      const user = (req as any).user;
      const userId = user?.id || user?.username || 'default-user';
      const item = await createItem(db, name, Boolean(done), userId);
      res.status(201).json(item);
    } catch (error: any) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid item' });
    }
  };

  const handleUpdateItem = async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const { name, done } = req.body ?? {};

    try {
      const user = (req as any).user;
      const userId = user?.role === 'admin' ? undefined : (user?.id || user?.username);
      const item = await updateItem(
        db,
        id,
        {
          name: typeof name === 'string' ? name : undefined,
          done: typeof done === 'boolean' ? done : undefined
        },
        userId
      );

      if (!item) {
        res.status(404).json({ error: 'Item not found' });
        return;
      }

      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid update' });
    }
  };

  const handleDeleteItem = async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (user && user.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const id = Number(req.params.id);
    try {
      const deleted = await removeItem(db, id);

      if (!deleted) {
        res.status(404).json({ error: 'Item not found' });
        return;
      }

      res.json({ deletedId: id });
    } catch (error: any) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete' });
    }
  };

  router.get(['/tasks', '/items'], handleListItems);
  router.get(['/tasks/:id', '/items/:id'], handleGetItem);
  router.post(['/tasks', '/items'], handleCreateItem);
  router.put(['/tasks/:id', '/items/:id'], handleUpdateItem);
  router.delete(['/tasks/:id', '/items/:id'], handleDeleteItem);

  return router;
}
