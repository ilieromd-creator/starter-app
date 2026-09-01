import { Router, Request, Response } from 'express';
import {
  listItems,
  createItem,
  updateItem,
  removeItem,
  computeTaskStats,
  DatabaseInstance,
  FilterOptions,
  PriorityLevel
} from '../database';

export function createTaskRoutes(db: DatabaseInstance) {
  const router = Router();

  const handleListItems = async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const userId = user?.role === 'admin' ? undefined : user?.id || user?.username;

      const filters: FilterOptions = {
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        category: typeof req.query.category === 'string' ? req.query.category : undefined,
        priority: typeof req.query.priority === 'string' ? req.query.priority : undefined,
        status:
          req.query.status === 'active' || req.query.status === 'completed' || req.query.status === 'all'
            ? req.query.status
            : undefined
      };

      const items = await listItems(db, userId, filters);
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  };

  const handleGetStats = async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const userId = user?.role === 'admin' ? undefined : user?.id || user?.username;

      const items = await listItems(db, userId);
      const stats = computeTaskStats(items);
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  };

  const handleGetItem = async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const userId = user?.role === 'admin' ? undefined : user?.id || user?.username;
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
    const { name, done = false, description, priority, category, due_date } = req.body ?? {};

    if (typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    try {
      const user = (req as any).user;
      const userId = user?.id || user?.username || 'default-user';
      const item = await createItem(db, name, Boolean(done), userId, {
        description: typeof description === 'string' ? description : undefined,
        priority: priority as PriorityLevel,
        category: typeof category === 'string' ? category : undefined,
        due_date: typeof due_date === 'string' ? due_date : undefined
      });
      res.status(201).json(item);
    } catch (error: any) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid item' });
    }
  };

  const handleUpdateItem = async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const { name, done, description, priority, category, due_date } = req.body ?? {};

    try {
      const user = (req as any).user;
      const userId = user?.role === 'admin' ? undefined : user?.id || user?.username;
      const item = await updateItem(
        db,
        id,
        {
          name: typeof name === 'string' ? name : undefined,
          done: typeof done === 'boolean' ? done : undefined,
          description: typeof description === 'string' ? description : undefined,
          priority: priority as PriorityLevel,
          category: typeof category === 'string' ? category : undefined,
          due_date: typeof due_date === 'string' ? due_date : undefined
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

  router.get('/stats', handleGetStats);
  router.get(['/tasks', '/items'], handleListItems);
  router.get(['/tasks/:id', '/items/:id'], handleGetItem);
  router.post(['/tasks', '/items'], handleCreateItem);
  router.put(['/tasks/:id', '/items/:id'], handleUpdateItem);
  router.delete(['/tasks/:id', '/items/:id'], handleDeleteItem);

  return router;
}
