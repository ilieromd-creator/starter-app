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
        fullName?: string;
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

  try {
    const payload = jwt.verify(token, jwtSecret) as {
      username?: string;
      role?: string;
      id?: string;
      fullName?: string;
    };
    req.user = {
      id: payload.id || payload.username,
      username: payload.username,
      role: payload.role || 'user',
      fullName: payload.fullName || (payload.username === 'admin' ? 'Administrator' : 'Standard User')
    };
    return next();
  } catch {
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
            fullName: (data.user.user_metadata?.full_name as string) || data.user.email?.split('@')[0],
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
  res.json({
    status: 'ok',
    service: 'starter-app',
    database: db.mode === 'supabase' ? 'supabase-postgresql' : 'in-memory',
    timestamp: new Date().toISOString()
  });
});

app.get('/metrics', (_req: Request, res: Response) => {
  res.json({
    service: 'starter-app',
    database: db.mode === 'supabase' ? 'supabase-postgresql' : 'in-memory',
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

  const user = typeof identifier === 'string' ? users[identifier as keyof typeof users] : undefined;
  if (user && user.password === password) {
    const token = jwt.sign(
      { username: identifier, role: user.role, id: identifier, fullName: user.fullName },
      jwtSecret,
      { expiresIn: '7d' }
    );
    res.json({
      token,
      role: user.role,
      user: { id: identifier, username: identifier, fullName: user.fullName, role: user.role }
    });
    return;
  }

  if (db.mode === 'supabase' && db.client && identifier && password) {
    const { data, error } = await db.client.auth.signInWithPassword({
      email: String(identifier),
      password: String(password)
    });
    if (!error && data?.session) {
      const userRole = (data.user.app_metadata?.role as string) || 'user';
      res.json({
        token: data.session.access_token,
        role: userRole,
        user: {
          id: data.user.id,
          email: data.user.email,
          fullName: data.user.user_metadata?.full_name || data.user.email?.split('@')[0],
          role: userRole
        }
      });
      return;
    }
  }

  res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/auth/signup', async (req: Request, res: Response) => {
  const { email, password, fullName } = req.body ?? {};

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  if (db.mode === 'supabase' && db.client) {
    const { data, error } = await db.client.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName || email.split('@')[0] }
      }
    });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    const session = data.session;
    res.status(201).json({
      message: 'Account created successfully',
      token: session?.access_token,
      user: data.user
    });
    return;
  }

  const newUsername = email.split('@')[0];
  users[newUsername] = { password, role: 'user', fullName: fullName || newUsername };
  const token = jwt.sign({ username: newUsername, role: 'user', id: newUsername, fullName }, jwtSecret, {
    expiresIn: '7d'
  });
  res.status(201).json({
    message: 'User registered in demo store',
    token,
    user: { id: newUsername, username: newUsername, role: 'user', fullName }
  });
});

app.get('/api/me', requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

// Borderless Monochrome Luxury Minimalist Frontend
app.get('/', (_req: Request, res: Response) => {
  res.type('html');
  res.send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Todo App - Starter App Frontend</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
    <style>
      :root {
        --canvas: #09090b;
        --surface-1: #121215;
        --surface-2: #191920;
        --surface-3: #23232c;
        --surface-hover: #2a2a35;
        --text-pure: #ffffff;
        --text-pearl: #e4e4e7;
        --text-muted: #8e8e93;
        --text-subtle: #52525b;
        --font: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: var(--font);
        background-color: var(--canvas);
        color: var(--text-pure);
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        letter-spacing: -0.015em;
        -webkit-font-smoothing: antialiased;
      }
      header {
        background: rgba(18, 18, 21, 0.7);
        backdrop-filter: blur(20px);
        padding: 1.1rem 2rem;
        position: sticky;
        top: 0;
        z-index: 50;
      }
      .header-container {
        max-width: 1040px;
        margin: 0 auto;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-weight: 700;
        font-size: 1.15rem;
        letter-spacing: -0.03em;
        color: var(--text-pure);
        text-decoration: none;
      }
      .brand-icon {
        width: 32px;
        height: 32px;
        background: var(--surface-2);
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-pure);
      }
      .user-actions {
        display: flex;
        align-items: center;
        gap: 1rem;
      }
      .profile-capsule {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        background: var(--surface-2);
        padding: 0.4rem 0.85rem;
        border-radius: 9999px;
        font-size: 0.85rem;
      }
      .avatar-circle {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: var(--surface-3);
        color: var(--text-pure);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.7rem;
        font-weight: 700;
      }
      .badge-role {
        font-size: 0.65rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 0.15rem 0.45rem;
        border-radius: 4px;
        background: var(--surface-3);
        color: var(--text-pearl);
      }
      .btn-luxury {
        padding: 0.55rem 1.1rem;
        border-radius: 8px;
        font-family: inherit;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
        border: none;
        outline: none;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
      }
      .btn-primary { background: #ffffff; color: #09090b; }
      .btn-primary:hover { background: #e4e4e7; transform: translateY(-1px); }
      .btn-secondary { background: var(--surface-2); color: var(--text-pearl); }
      .btn-secondary:hover { background: var(--surface-3); color: #ffffff; }
      .btn-danger-ghost { background: transparent; color: var(--text-subtle); }
      .btn-danger-ghost:hover { background: var(--surface-2); color: #ffffff; }

      main {
        max-width: 1040px;
        width: 100%;
        margin: 2rem auto;
        padding: 0 1.5rem;
        flex: 1;
      }

      /* KPI Metric Blocks */
      .kpi-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 1rem;
        margin-bottom: 2rem;
      }
      .kpi-box {
        background: var(--surface-1);
        border-radius: 12px;
        padding: 1.4rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .kpi-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: var(--text-muted);
        font-size: 0.8rem;
        font-weight: 500;
      }
      .kpi-num {
        font-size: 2.1rem;
        font-weight: 800;
        color: var(--text-pure);
        letter-spacing: -0.04em;
      }
      .kpi-desc {
        font-size: 0.75rem;
        color: var(--text-subtle);
      }
      .progress-track {
        background: var(--surface-2);
        border-radius: 9999px;
        height: 4px;
        width: 100%;
        overflow: hidden;
        margin-top: 0.5rem;
      }
      .progress-pearl {
        background: #ffffff;
        height: 100%;
        width: 0%;
        transition: width 0.5s cubic-bezier(0.16, 1, 0.3, 1);
      }

      /* Creation Area */
      .composer-panel {
        background: var(--surface-1);
        border-radius: 14px;
        padding: 1.5rem;
        margin-bottom: 2rem;
      }
      .composer-grid {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr auto;
        gap: 0.75rem;
      }
      @media(max-width: 768px) {
        .composer-grid { grid-template-columns: 1fr; }
      }
      input, select, textarea {
        background: var(--surface-2);
        border: none;
        outline: none;
        border-radius: 8px;
        color: var(--text-pure);
        padding: 0.75rem 1rem;
        font-family: inherit;
        font-size: 0.9rem;
        width: 100%;
        transition: background 0.15s;
      }
      input:focus, select:focus, textarea:focus {
        background: var(--surface-3);
      }
      input::placeholder { color: var(--text-subtle); }

      /* Control Toolbar */
      .toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 1rem;
        margin-bottom: 1.25rem;
      }
      .filter-capsules {
        display: flex;
        gap: 0.4rem;
      }
      .capsule {
        padding: 0.45rem 1rem;
        border-radius: 9999px;
        background: var(--surface-1);
        border: none;
        outline: none;
        color: var(--text-muted);
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;
      }
      .capsule.active {
        background: var(--surface-3);
        color: var(--text-pure);
      }
      .search-box {
        position: relative;
        width: 300px;
      }
      .search-icon {
        position: absolute;
        left: 0.85rem;
        top: 50%;
        transform: translateY(-50%);
        color: var(--text-subtle);
        pointer-events: none;
      }
      .search-input {
        padding-left: 2.4rem;
        font-size: 0.85rem;
        background: var(--surface-1);
      }

      /* Task Items */
      .item-stack {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
      }
      .item-row {
        background: var(--surface-1);
        border-radius: 12px;
        padding: 1.1rem 1.4rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: background 0.2s ease, transform 0.2s ease;
      }
      .item-row:hover {
        background: var(--surface-2);
        transform: translateY(-1px);
      }
      .item-main {
        display: flex;
        align-items: flex-start;
        gap: 1rem;
        flex: 1;
      }
      .custom-check {
        width: 20px;
        height: 20px;
        border-radius: 6px;
        background: var(--surface-3);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        margin-top: 0.15rem;
        flex-shrink: 0;
        transition: background 0.2s;
      }
      .custom-check.checked {
        background: #ffffff;
        color: #09090b;
      }
      .item-details { display: flex; flex-direction: column; gap: 0.3rem; }
      .item-name { font-size: 0.95rem; font-weight: 600; color: var(--text-pure); }
      .item-name.done { text-decoration: line-through; color: var(--text-subtle); }
      .item-desc { font-size: 0.8rem; color: var(--text-muted); line-height: 1.4; }
      .meta-pills { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.2rem; }
      .pill-badge {
        font-size: 0.7rem;
        font-weight: 600;
        padding: 0.2rem 0.6rem;
        border-radius: 6px;
        background: var(--surface-3);
        color: var(--text-pearl);
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
      }
      .empty-notice {
        text-align: center;
        padding: 4rem 1rem;
        color: var(--text-subtle);
        font-size: 0.9rem;
      }

      /* Modal */
      .modal-curtain {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.85);
        backdrop-filter: blur(20px);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 100;
      }
      .modal-panel {
        background: var(--surface-1);
        border-radius: 16px;
        padding: 2.2rem;
        max-width: 420px;
        width: 90%;
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
      }
      .segmented-tabs {
        display: flex;
        background: var(--surface-2);
        border-radius: 8px;
        padding: 0.25rem;
      }
      .seg-tab {
        flex: 1;
        text-align: center;
        padding: 0.5rem;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
        border-radius: 6px;
        color: var(--text-muted);
        transition: all 0.15s;
      }
      .seg-tab.active {
        background: var(--surface-3);
        color: var(--text-pure);
      }
      .demo-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
      }
    </style>
  </head>
  <body>
    <header>
      <div class="header-container">
        <a href="/" class="brand">
          <div class="brand-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
          </div>
          <span>TaskFlow</span>
        </a>
        <div class="user-actions">
          <div class="profile-capsule">
            <div id="userAvatar" class="avatar-circle">A</div>
            <span id="userName" style="font-weight: 600;">Admin</span>
            <span id="userRole" class="badge-role">ADMIN</span>
          </div>
          <button id="authTriggerBtn" class="btn-luxury btn-secondary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span>Account</span>
          </button>
        </div>
      </div>
    </header>

    <main>
      <!-- KPI Metric Blocks -->
      <section class="kpi-row">
        <div class="kpi-box">
          <div class="kpi-head">
            <span>Total Tasks</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
          </div>
          <div id="kpiTotal" class="kpi-num">0</div>
          <div class="kpi-desc">Global inventory</div>
        </div>

        <div class="kpi-box">
          <div class="kpi-head">
            <span>Completed</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <div id="kpiCompleted" class="kpi-num">0</div>
          <div id="kpiRateText" class="kpi-desc">0% completion rate</div>
          <div class="progress-track">
            <div id="progressFill" class="progress-pearl"></div>
          </div>
        </div>

        <div class="kpi-box">
          <div class="kpi-head">
            <span>Active</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
          <div id="kpiActive" class="kpi-num">0</div>
          <div class="kpi-desc">In progress</div>
        </div>

        <div class="kpi-box">
          <div class="kpi-head">
            <span>Urgent</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
          </div>
          <div id="kpiUrgent" class="kpi-num">0</div>
          <div class="kpi-desc">High priority queue</div>
        </div>
      </section>

      <!-- Task Creator -->
      <section class="composer-panel">
        <form id="createTaskForm" style="display: flex; flex-direction: column; gap: 0.85rem;">
          <div class="composer-grid">
            <input id="taskNameInput" placeholder="Define task requirement..." required />
            <select id="taskCategorySelect">
              <option value="Work">Work</option>
              <option value="Personal">Personal</option>
              <option value="Finance">Finance</option>
              <option value="Learning">Learning</option>
              <option value="Projects">Projects</option>
            </select>
            <select id="taskPrioritySelect">
              <option value="low">Low Priority</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <button type="submit" class="btn-luxury btn-primary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
              <span>Add Task</span>
            </button>
          </div>
          <input id="taskDescInput" placeholder="Optional context or description details..." style="font-size: 0.85rem;" />
        </form>
      </section>

      <!-- Search & Filters -->
      <section class="toolbar">
        <div class="filter-capsules">
          <button class="capsule active" data-status="all">All</button>
          <button class="capsule" data-status="active">Active</button>
          <button class="capsule" data-status="completed">Completed</button>
        </div>
        <div class="search-box">
          <div class="search-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </div>
          <input id="searchInput" class="search-input" placeholder="Search tasks..." />
        </div>
      </section>

      <!-- Task Stack -->
      <section id="taskList" class="item-stack"></section>
    </main>

    <!-- Minimalist Auth Modal -->
    <div id="authModal" class="modal-curtain">
      <div class="modal-panel">
        <div class="segmented-tabs">
          <div id="tabSignIn" class="seg-tab active">Sign In</div>
          <div id="tabSignUp" class="seg-tab">Register</div>
        </div>

        <form id="authForm" style="display: flex; flex-direction: column; gap: 0.85rem;">
          <input id="authEmail" type="text" placeholder="Email or Username" required />
          <input id="authPassword" type="password" placeholder="Password" required />
          <div id="signUpNameWrapper" style="display: none;">
            <input id="authFullName" type="text" placeholder="Full Name" />
          </div>
          <button type="submit" id="authSubmitBtn" class="btn-luxury btn-primary" style="justify-content: center;">Continue</button>
        </form>

        <div style="text-align: center; font-size: 0.7rem; color: var(--text-subtle); letter-spacing: 0.08em; text-transform: uppercase;">
          Instant Access
        </div>

        <div class="demo-actions">
          <button id="quickAdminBtn" class="btn-luxury btn-secondary" style="justify-content: center;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
            <span>Admin</span>
          </button>
          <button id="quickUserBtn" class="btn-luxury btn-secondary" style="justify-content: center;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span>User</span>
          </button>
        </div>

        <button id="closeModalBtn" class="btn-luxury btn-danger-ghost" style="justify-content: center; font-size: 0.8rem;">Dismiss</button>
      </div>
    </div>

    <script>
      let token = localStorage.getItem('token') || '';
      let currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      let currentFilterStatus = 'all';
      let currentSearchQuery = '';

      async function checkAuth() {
        if (!token) {
          await quickLogin('admin', 'secret');
        } else {
          updateUserUI();
          loadTasks();
        }
      }

      function updateUserUI() {
        const name = currentUser.fullName || currentUser.username || currentUser.email || 'Admin';
        const role = (currentUser.role || 'user').toUpperCase();
        document.getElementById('userName').textContent = name;
        document.getElementById('userRole').textContent = role;
        document.getElementById('userAvatar').textContent = name.charAt(0).toUpperCase();
      }

      async function quickLogin(username, password) {
        try {
          const res = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });
          const data = await res.json();
          if (data.token) {
            token = data.token;
            currentUser = data.user || { username, role: data.role };
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(currentUser));
            updateUserUI();
            closeAuthModal();
            loadTasks();
          }
        } catch (e) {
          console.error(e);
        }
      }

      async function loadTasks() {
        let url = '/items?';
        if (currentFilterStatus !== 'all') url += '&status=' + encodeURIComponent(currentFilterStatus);
        if (currentSearchQuery) url += '&search=' + encodeURIComponent(currentSearchQuery);

        try {
          const res = await fetch(url, {
            headers: { Authorization: 'Bearer ' + token }
          });
          if (res.status === 401) {
            token = '';
            localStorage.removeItem('token');
            return checkAuth();
          }
          const items = await res.json();
          renderTaskList(items);
          loadStats();
        } catch (err) {
          console.error(err);
        }
      }

      async function loadStats() {
        try {
          const res = await fetch('/stats', {
            headers: { Authorization: 'Bearer ' + token }
          });
          if (res.ok) {
            const stats = await res.json();
            document.getElementById('kpiTotal').textContent = stats.total;
            document.getElementById('kpiCompleted').textContent = stats.completed;
            document.getElementById('kpiActive').textContent = stats.active;
            document.getElementById('kpiUrgent').textContent = stats.urgent;
            document.getElementById('kpiRateText').textContent = stats.completionRate + '% completion rate';
            document.getElementById('progressFill').style.width = stats.completionRate + '%';
          }
        } catch (e) {}
      }

      function renderTaskList(items) {
        const container = document.getElementById('taskList');
        container.innerHTML = '';

        if (!items || items.length === 0) {
          container.innerHTML = '<div class="empty-notice">No records match current parameters.</div>';
          return;
        }

        items.forEach((task) => {
          const itemDiv = document.createElement('div');
          itemDiv.className = 'item-row';

          const main = document.createElement('div');
          main.className = 'item-main';

          const chk = document.createElement('div');
          chk.className = 'custom-check' + (task.done ? ' checked' : '');
          if (task.done) {
            chk.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
          }
          chk.onclick = async () => {
            await fetch('/items/' + task.id, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
              body: JSON.stringify({ done: !task.done })
            });
            loadTasks();
          };

          const details = document.createElement('div');
          details.className = 'item-details';

          const title = document.createElement('div');
          title.className = 'item-name' + (task.done ? ' done' : '');
          title.textContent = task.name;
          details.appendChild(title);

          if (task.description) {
            const desc = document.createElement('div');
            desc.className = 'item-desc';
            desc.textContent = task.description;
            details.appendChild(desc);
          }

          const meta = document.createElement('div');
          meta.className = 'meta-pills';

          const cat = document.createElement('span');
          cat.className = 'pill-badge';
          cat.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><circle cx="7" cy="7" r=".5"/></svg> ' + (task.category || 'Work');
          meta.appendChild(cat);

          const prio = document.createElement('span');
          prio.className = 'pill-badge';
          prio.textContent = (task.priority || 'medium').toUpperCase();
          meta.appendChild(prio);

          details.appendChild(meta);
          main.appendChild(chk);
          main.appendChild(details);

          const actions = document.createElement('div');
          const delBtn = document.createElement('button');
          delBtn.className = 'btn-luxury btn-danger-ghost';
          delBtn.style.padding = '0.35rem 0.6rem';
          delBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>';
          delBtn.onclick = async () => {
            const res = await fetch('/items/' + task.id, {
              method: 'DELETE',
              headers: { Authorization: 'Bearer ' + token }
            });
            if (res.status === 403) {
              alert('Delete restricted to administrator role.');
            } else {
              loadTasks();
            }
          };

          actions.appendChild(delBtn);
          itemDiv.appendChild(main);
          itemDiv.appendChild(actions);
          container.appendChild(itemDiv);
        });
      }

      document.getElementById('createTaskForm').onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('taskNameInput').value.trim();
        const category = document.getElementById('taskCategorySelect').value;
        const priority = document.getElementById('taskPrioritySelect').value;
        const description = document.getElementById('taskDescInput').value.trim();

        if (!name) return;

        await fetch('/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ name, category, priority, description, done: false })
        });

        document.getElementById('taskNameInput').value = '';
        document.getElementById('taskDescInput').value = '';
        loadTasks();
      };

      document.querySelectorAll('.capsule').forEach((btn) => {
        btn.onclick = () => {
          document.querySelectorAll('.capsule').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          currentFilterStatus = btn.dataset.status;
          loadTasks();
        };
      });

      let searchTimer;
      document.getElementById('searchInput').oninput = (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          currentSearchQuery = e.target.value.trim();
          loadTasks();
        }, 200);
      };

      const modal = document.getElementById('authModal');
      let isSignUp = false;

      function openAuthModal() { modal.style.display = 'flex'; }
      function closeAuthModal() { modal.style.display = 'none'; }

      document.getElementById('authTriggerBtn').onclick = openAuthModal;
      document.getElementById('closeModalBtn').onclick = closeAuthModal;

      document.getElementById('tabSignIn').onclick = () => {
        isSignUp = false;
        document.getElementById('tabSignIn').classList.add('active');
        document.getElementById('tabSignUp').classList.remove('active');
        document.getElementById('signUpNameWrapper').style.display = 'none';
        document.getElementById('authSubmitBtn').textContent = 'Continue';
      };

      document.getElementById('tabSignUp').onclick = () => {
        isSignUp = true;
        document.getElementById('tabSignUp').classList.add('active');
        document.getElementById('tabSignIn').classList.remove('active');
        document.getElementById('signUpNameWrapper').style.display = 'block';
        document.getElementById('authSubmitBtn').textContent = 'Create Account';
      };

      document.getElementById('authForm').onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('authEmail').value.trim();
        const password = document.getElementById('authPassword').value;
        const fullName = document.getElementById('authFullName').value.trim();

        const endpoint = isSignUp ? '/api/auth/signup' : '/login';
        const payload = isSignUp ? { email, password, fullName } : { username: email, password };

        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          if (data.token) {
            token = data.token;
            currentUser = data.user || { username: email, role: data.role || 'user' };
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(currentUser));
            updateUserUI();
            closeAuthModal();
            loadTasks();
          } else {
            alert(data.error || 'Authentication failed');
          }
        } catch (err) {
          alert('Network or server error');
        }
      };

      document.getElementById('quickAdminBtn').onclick = () => quickLogin('admin', 'secret');
      document.getElementById('quickUserBtn').onclick = () => quickLogin('user', 'secret');

      checkAuth();
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
