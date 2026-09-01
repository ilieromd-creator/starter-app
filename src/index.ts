import express, { NextFunction, Request, Response } from 'express';
import path from 'node:path';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { initializeDatabase } from './database';
import { createTaskRoutes } from './modules/taskRoutes';
import { createUserRoutes } from './modules/userRoutes';

dotenv.config();

declare global {
  namespace Express {
    interface Request {
      user?: {
        id?: string;
        username?: string;
        role?: string;
        email?: string;
      };
    }
  }
}

const app = express();
const startedAt = Date.now();
const requestLog: Array<{ method: string; url: string; timestamp: string }> = [];
const port = Number(process.env.PORT || 3000);
const db = initializeDatabase();
const jwtSecret = process.env.JWT_SECRET || 'development-secret';

const users: Record<string, { password: string; role: string; fullName: string }> = {
  admin: { password: 'secret', role: 'admin', fullName: 'Administrator' },
  user: { password: 'secret', role: 'user', fullName: 'Standard User' }
};

app.disable('x-powered-by');
app.use(cors());
app.use(express.json());
app.use((req, _res, next) => {
  requestLog.push({
    method: req.method,
    url: req.originalUrl,
    timestamp: new Date().toISOString()
  });
  next();
});
app.use('/app', express.static(path.join(process.cwd(), 'public', 'app')));

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = header.replace('Bearer ', '').trim();

  // 1. Check local / demo JWT token
  try {
    const payload = jwt.verify(token, jwtSecret) as { username?: string; role?: string; id?: string };
    req.user = {
      id: payload.id || payload.username,
      username: payload.username,
      role: payload.role || 'user'
    };
    return next();
  } catch {
    // 2. If local verify fails, try Supabase Auth verification
    if (db.mode === 'supabase' && db.client) {
      try {
        const { data, error } = await db.client.auth.getUser(token);
        if (!error && data?.user) {
          const userRole =
            (data.user.app_metadata?.role as string) ||
            (data.user.user_metadata?.role as string) ||
            'user';
          req.user = {
            id: data.user.id,
            email: data.user.email,
            username: data.user.email?.split('@')[0] || data.user.id,
            role: userRole
          };
          return next();
        }
      } catch {
        // Fallthrough
      }
    }

    res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user || user.role !== role) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    next();
  };
}

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'starter-app' });
});

app.get('/metrics', (_req: Request, res: Response) => {
  res.json({
    service: 'starter-app',
    uptimeMs: Date.now() - startedAt,
    startedAt
  });
});

app.get('/logs', (_req: Request, res: Response) => {
  res.json(requestLog);
});

app.post('/login', async (req: Request, res: Response) => {
  const { username, password, email } = req.body ?? {};
  const identifier = username || email;

  // 1. Demo users
  const user = typeof identifier === 'string' ? users[identifier as keyof typeof users] : undefined;
  if (user && user.password === password) {
    const token = jwt.sign({ username: identifier, role: user.role, id: identifier }, jwtSecret, {
      expiresIn: '1h'
    });
    res.json({ token, role: user.role });
    return;
  }

  // 2. Supabase Auth
  if (db.mode === 'supabase' && db.client && identifier && password) {
    const { data, error } = await db.client.auth.signInWithPassword({
      email: identifier,
      password: String(password)
    });
    if (!error && data?.session) {
      const userRole = (data.user.app_metadata?.role as string) || 'user';
      res.json({
        token: data.session.access_token,
        role: userRole,
        user: { id: data.user.id, email: data.user.email }
      });
      return;
    }
  }

  res.status(401).json({ error: 'Invalid credentials' });
});

app.get('/', (_req: Request, res: Response) => {
  res.type('html');
  res.send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Todo App - Starter App</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; margin: 2rem; background: #0f172a; color: #f8fafc; }
      .container { max-width: 680px; margin: 2rem auto; background: #1e293b; padding: 2rem; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
      h1 { margin-top: 0; color: #38bdf8; font-size: 1.8rem; }
      .input-group { display: flex; gap: 0.5rem; margin: 1.5rem 0; }
      input { flex: 1; padding: 0.75rem 1rem; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: white; font-size: 1rem; }
      input:focus { outline: 2px solid #38bdf8; border-color: transparent; }
      button { padding: 0.75rem 1.25rem; border-radius: 8px; border: none; background: #38bdf8; color: #0f172a; font-weight: 600; cursor: pointer; transition: background 0.2s; }
      button:hover { background: #7dd3fc; }
      ul { list-style: none; padding: 0; margin: 0; }
      li { display: flex; justify-content: space-between; align-items: center; background: #334155; margin: 0.5rem 0; padding: 0.9rem 1rem; border-radius: 8px; }
      .done { text-decoration: line-through; color: #94a3b8; }
      .meta { display: flex; justify-content: space-between; margin-bottom: 1rem; font-size: 0.85rem; color: #94a3b8; }
      .btn-sm { padding: 0.4rem 0.8rem; font-size: 0.85rem; }
      .btn-del { background: #ef4444; color: white; margin-left: 0.5rem; }
      .btn-del:hover { background: #f87171; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="meta">
        <span>Service: starter-app</span>
        <span id="authStatus">Status: Logged in (Demo)</span>
      </div>
      <h1>Todo App</h1>
      <div class="input-group">
        <input id="todoInput" placeholder="Add a new task..." />
        <button id="addButton">Add Task</button>
      </div>
      <ul id="todoList"></ul>
    </div>

    <script>
      let token = localStorage.getItem('token') || '';

      const ensureLogin = async () => {
        if (!token) {
          try {
            const res = await fetch('/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: 'admin', password: 'secret' })
            });
            const data = await res.json();
            if (data.token) {
              token = data.token;
              localStorage.setItem('token', token);
            }
          } catch (e) {
            console.error('Auto login failed', e);
          }
        }
      };

      const fetchItems = async () => {
        await ensureLogin();
        try {
          const res = await fetch('/items', {
            headers: { Authorization: 'Bearer ' + token }
          });
          if (res.status === 401) {
            localStorage.removeItem('token');
            token = '';
            await ensureLogin();
            return fetchItems();
          }
          const items = await res.json();
          const list = document.getElementById('todoList');
          list.innerHTML = '';

          (items || []).forEach((item) => {
            const li = document.createElement('li');
            const span = document.createElement('span');
            span.textContent = item.name;
            if (item.done) span.className = 'done';

            const actions = document.createElement('div');
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'btn-sm';
            toggleBtn.textContent = item.done ? 'Undo' : 'Done';
            toggleBtn.onclick = async () => {
              await fetch('/items/' + item.id, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: 'Bearer ' + token
                },
                body: JSON.stringify({ done: !item.done })
              });
              fetchItems();
            };

            const delBtn = document.createElement('button');
            delBtn.className = 'btn-sm btn-del';
            delBtn.textContent = 'Delete';
            delBtn.onclick = async () => {
              await fetch('/items/' + item.id, {
                method: 'DELETE',
                headers: { Authorization: 'Bearer ' + token }
              });
              fetchItems();
            };

            actions.appendChild(toggleBtn);
            actions.appendChild(delBtn);
            li.appendChild(span);
            li.appendChild(actions);
            list.appendChild(li);
          });
        } catch (err) {
          console.error(err);
        }
      };

      document.getElementById('addButton').addEventListener('click', async () => {
        const input = document.getElementById('todoInput');
        const val = input.value.trim();
        if (!val) return;
        await ensureLogin();
        await fetch('/items', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token
          },
          body: JSON.stringify({ name: val, done: false })
        });
        input.value = '';
        fetchItems();
      });

      fetchItems();
    </script>
  </body>
</html>`);
});

const taskRouter = createTaskRoutes(db);
const userRouter = createUserRoutes(users);

app.use(requireAuth);
app.use(taskRouter);
app.use('/api', taskRouter);
app.use('/api', userRouter);

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

export { app };
