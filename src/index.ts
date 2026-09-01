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

  // 1. Check local / demo JWT token
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
    // 2. Try Supabase Auth token
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

// Auth Routes: Login, Sign Up, Profile
app.post('/login', async (req: Request, res: Response) => {
  const { username, password, email } = req.body ?? {};
  const identifier = username || email;

  // 1. Demo users
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

  // 2. Supabase Auth
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

  // In-memory demo signup
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

// Serve modern SaaS Frontend
app.get('/', (_req: Request, res: Response) => {
  res.type('html');
  res.send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Todo App - TaskFlow SaaS Starter App Frontend</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
    <style>
      :root {
        --bg-main: #090d16;
        --bg-card: #111827;
        --bg-card-hover: #162032;
        --bg-input: #0b1120;
        --border-color: #1f293d;
        --border-focus: #38bdf8;
        --text-main: #f8fafc;
        --text-muted: #94a3b8;
        --primary: #38bdf8;
        --primary-hover: #7dd3fc;
        --success: #10b981;
        --warning: #f59e0b;
        --danger: #ef4444;
        --font: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      }
      * { box-sizing: border-box; }
      body {
        font-family: var(--font);
        margin: 0;
        background-color: var(--bg-main);
        color: var(--text-main);
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }
      header {
        background: rgba(17, 24, 39, 0.85);
        backdrop-filter: blur(12px);
        border-bottom: 1px solid var(--border-color);
        padding: 0.85rem 1.5rem;
        position: sticky;
        top: 0;
        z-index: 50;
      }
      .header-content {
        max-width: 1080px;
        margin: 0 auto;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .logo {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        font-weight: 800;
        font-size: 1.25rem;
        color: var(--text-main);
        text-decoration: none;
      }
      .logo-badge {
        background: linear-gradient(135deg, #38bdf8, #818cf8);
        color: #090d16;
        padding: 0.25rem 0.6rem;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 700;
      }
      .user-panel {
        display: flex;
        align-items: center;
        gap: 0.85rem;
      }
      .user-badge {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: var(--bg-input);
        border: 1px solid var(--border-color);
        padding: 0.35rem 0.75rem;
        border-radius: 9999px;
        font-size: 0.85rem;
      }
      .user-avatar {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: #38bdf8;
        color: #090d16;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 0.75rem;
      }
      .role-pill {
        font-size: 0.65rem;
        padding: 0.15rem 0.45rem;
        border-radius: 4px;
        text-transform: uppercase;
        font-weight: 700;
        background: rgba(56, 189, 248, 0.15);
        color: #38bdf8;
      }
      .btn {
        padding: 0.55rem 1rem;
        border-radius: 8px;
        font-family: inherit;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
        border: none;
        transition: all 0.2s ease;
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
      }
      .btn-primary { background: #38bdf8; color: #090d16; }
      .btn-primary:hover { background: #7dd3fc; }
      .btn-outline { background: transparent; border: 1px solid var(--border-color); color: var(--text-main); }
      .btn-outline:hover { background: var(--bg-card); border-color: #38bdf8; }
      .btn-danger { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
      .btn-danger:hover { background: #ef4444; color: white; }
      .btn-sm { padding: 0.35rem 0.65rem; font-size: 0.75rem; }

      main {
        max-width: 1080px;
        width: 100%;
        margin: 1.5rem auto;
        padding: 0 1.25rem;
        flex: 1;
      }

      /* KPI Cards Grid */
      .kpi-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 1rem;
        margin-bottom: 1.5rem;
      }
      .kpi-card {
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        position: relative;
        overflow: hidden;
      }
      .kpi-title { font-size: 0.8rem; color: var(--text-muted); font-weight: 500; }
      .kpi-value { font-size: 1.75rem; font-weight: 800; color: var(--text-main); }
      .kpi-sub { font-size: 0.75rem; color: var(--text-muted); }

      /* Progress Bar */
      .progress-bar-container {
        background: var(--bg-input);
        border-radius: 9999px;
        height: 6px;
        width: 100%;
        margin-top: 0.5rem;
        overflow: hidden;
      }
      .progress-fill {
        background: linear-gradient(90deg, #38bdf8, #10b981);
        height: 100%;
        width: 0%;
        transition: width 0.4s ease;
      }

      /* Create Task Box */
      .card-box {
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 1.5rem;
        margin-bottom: 1.5rem;
      }
      .box-header { font-size: 1.05rem; font-weight: 700; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; }
      .task-form-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 0.85rem;
      }
      .form-row-2 {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr 1fr;
        gap: 0.75rem;
      }
      @media(max-width: 768px) {
        .form-row-2 { grid-template-columns: 1fr; }
      }
      input, select, textarea {
        background: var(--bg-input);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        color: white;
        padding: 0.65rem 0.85rem;
        font-family: inherit;
        font-size: 0.9rem;
        width: 100%;
      }
      input:focus, select:focus, textarea:focus {
        outline: none;
        border-color: var(--border-focus);
      }

      /* Filter & Search Bar */
      .filter-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1rem;
      }
      .pills { display: flex; gap: 0.4rem; }
      .pill {
        padding: 0.4rem 0.85rem;
        border-radius: 9999px;
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        color: var(--text-muted);
        transition: all 0.15s;
      }
      .pill.active {
        background: #38bdf8;
        color: #090d16;
        border-color: #38bdf8;
      }

      /* Task Item List */
      .task-list {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
      }
      .task-item {
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        padding: 1rem 1.2rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: transform 0.15s ease, border-color 0.15s ease;
      }
      .task-item:hover {
        border-color: #334155;
        background: var(--bg-card-hover);
      }
      .task-left {
        display: flex;
        align-items: flex-start;
        gap: 0.85rem;
        flex: 1;
      }
      .task-checkbox {
        width: 20px;
        height: 20px;
        cursor: pointer;
        accent-color: #38bdf8;
        margin-top: 0.2rem;
      }
      .task-info { display: flex; flex-direction: column; gap: 0.25rem; }
      .task-title { font-weight: 600; font-size: 0.95rem; }
      .task-title.done { text-decoration: line-through; color: var(--text-muted); }
      .task-desc { font-size: 0.8rem; color: var(--text-muted); line-height: 1.4; }
      .task-badges { display: flex; gap: 0.4rem; align-items: center; margin-top: 0.2rem; }
      .tag {
        font-size: 0.7rem;
        font-weight: 600;
        padding: 0.15rem 0.5rem;
        border-radius: 4px;
      }
      .tag-cat { background: #1e293b; color: #94a3b8; border: 1px solid #334155; }
      .tag-prio-low { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }
      .tag-prio-medium { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }
      .tag-prio-high { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
      .tag-prio-urgent { background: rgba(239, 68, 68, 0.15); color: #f87171; }

      .empty-state {
        text-align: center;
        padding: 3rem 1rem;
        color: var(--text-muted);
      }

      /* Auth Modal */
      .modal-backdrop {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(8px);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 100;
      }
      .modal-card {
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 14px;
        padding: 2rem;
        max-width: 440px;
        width: 90%;
        box-shadow: 0 20px 40px rgba(0,0,0,0.5);
      }
      .modal-tabs { display: flex; border-bottom: 1px solid var(--border-color); margin-bottom: 1.5rem; }
      .modal-tab { flex: 1; text-align: center; padding: 0.75rem; font-weight: 600; cursor: pointer; color: var(--text-muted); }
      .modal-tab.active { color: #38bdf8; border-bottom: 2px solid #38bdf8; }
      .demo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-top: 1rem; }
    </style>
  </head>
  <body>
    <header>
      <div class="header-content">
        <a href="/" class="logo">
          <span>⚡ TaskFlow</span>
          <span class="logo-badge">PRO</span>
        </a>
        <div class="user-panel">
          <div id="userBadge" class="user-badge">
            <div id="userAvatar" class="user-avatar">A</div>
            <span id="userName">Admin</span>
            <span id="userRole" class="role-pill">ADMIN</span>
          </div>
          <button id="authActionBtn" class="btn btn-outline btn-sm">Sign In / Switch</button>
        </div>
      </div>
    </header>

    <main>
      <!-- KPI Stats -->
      <section class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-title">Total Tasks</div>
          <div id="kpiTotal" class="kpi-value">0</div>
          <div class="kpi-sub">Across all projects</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-title">Completed</div>
          <div id="kpiCompleted" class="kpi-value" style="color: #10b981;">0</div>
          <div class="kpi-sub" id="kpiCompletedSub">0% completion rate</div>
          <div class="progress-bar-container">
            <div id="progressFill" class="progress-fill"></div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-title">Active & In Progress</div>
          <div id="kpiActive" class="kpi-value" style="color: #38bdf8;">0</div>
          <div class="kpi-sub">Pending completion</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-title">Urgent Priority</div>
          <div id="kpiUrgent" class="kpi-value" style="color: #f87171;">0</div>
          <div class="kpi-sub">Requires immediate action</div>
        </div>
      </section>

      <!-- Create Task Card -->
      <section class="card-box">
        <div class="box-header">
          <span>Add New Task</span>
        </div>
        <form id="createTaskForm" class="task-form-grid">
          <div class="form-row-2">
            <input id="taskNameInput" placeholder="What needs to be done?" required />
            <select id="taskCategorySelect">
              <option value="Work">💼 Work</option>
              <option value="Personal">🏠 Personal</option>
              <option value="Finance">💰 Finance</option>
              <option value="Learning">📚 Learning</option>
              <option value="Projects">🚀 Projects</option>
            </select>
            <select id="taskPrioritySelect">
              <option value="low">🟢 Low</option>
              <option value="medium" selected>🔵 Medium</option>
              <option value="high">🟡 High</option>
              <option value="urgent">🔴 Urgent</option>
            </select>
            <button type="submit" class="btn btn-primary">Add Task</button>
          </div>
          <input id="taskDescInput" placeholder="Optional details / description..." />
        </form>
      </section>

      <!-- Filter and Task List -->
      <section class="filter-bar">
        <div class="pills">
          <button class="pill active" data-status="all">All</button>
          <button class="pill" data-status="active">Active</button>
          <button class="pill" data-status="completed">Completed</button>
        </div>
        <div style="display: flex; gap: 0.5rem; flex: 1; max-width: 380px;">
          <input id="searchInput" placeholder="Search tasks..." style="padding: 0.4rem 0.75rem; font-size: 0.85rem;" />
        </div>
      </section>

      <section id="taskList" class="task-list"></section>
    </main>

    <!-- Auth Modal -->
    <div id="authModal" class="modal-backdrop">
      <div class="modal-card">
        <div class="modal-tabs">
          <div id="tabSignIn" class="modal-tab active">Sign In</div>
          <div id="tabSignUp" class="modal-tab">Create Account</div>
        </div>

        <form id="authForm" style="display: flex; flex-direction: column; gap: 0.85rem;">
          <input id="authEmail" type="text" placeholder="Email or Username" required />
          <input id="authPassword" type="password" placeholder="Password" required />
          <div id="signUpNameWrapper" style="display: none;">
            <input id="authFullName" type="text" placeholder="Full Name" />
          </div>
          <button type="submit" id="authSubmitBtn" class="btn btn-primary" style="justify-content: center; width: 100%;">Sign In</button>
        </form>

        <div style="margin: 1.5rem 0 0.75rem; text-align: center; font-size: 0.75rem; color: var(--text-muted);">
          OR USE QUICK DEMO
        </div>

        <div class="demo-grid">
          <button id="quickAdminBtn" class="btn btn-outline" style="justify-content: center;">👑 Demo Admin</button>
          <button id="quickUserBtn" class="btn btn-outline" style="justify-content: center;">👤 Demo User</button>
        </div>

        <button id="closeModalBtn" class="btn btn-outline" style="margin-top: 1rem; width: 100%; justify-content: center;">Cancel</button>
      </div>
    </div>

    <script>
      let token = localStorage.getItem('token') || '';
      let currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      let currentFilterStatus = 'all';
      let currentSearchQuery = '';

      // Initialize default demo login if none exists
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
            document.getElementById('kpiCompletedSub').textContent = stats.completionRate + '% completion rate';
            document.getElementById('progressFill').style.width = stats.completionRate + '%';
          }
        } catch (e) {}
      }

      function renderTaskList(items) {
        const container = document.getElementById('taskList');
        container.innerHTML = '';

        if (!items || items.length === 0) {
          container.innerHTML = '<div class="empty-state">No tasks found. Create a new task to get started! 🚀</div>';
          return;
        }

        items.forEach((task) => {
          const itemDiv = document.createElement('div');
          itemDiv.className = 'task-item';

          const left = document.createElement('div');
          left.className = 'task-left';

          const chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.className = 'task-checkbox';
          chk.checked = Boolean(task.done);
          chk.onchange = async () => {
            await fetch('/items/' + task.id, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
              body: JSON.stringify({ done: chk.checked })
            });
            loadTasks();
          };

          const info = document.createElement('div');
          info.className = 'task-info';

          const title = document.createElement('div');
          title.className = 'task-title' + (task.done ? ' done' : '');
          title.textContent = task.name;

          info.appendChild(title);

          if (task.description) {
            const desc = document.createElement('div');
            desc.className = 'task-desc';
            desc.textContent = task.description;
            info.appendChild(desc);
          }

          const badges = document.createElement('div');
          badges.className = 'task-badges';

          const catTag = document.createElement('span');
          catTag.className = 'tag tag-cat';
          catTag.textContent = task.category || 'Work';
          badges.appendChild(catTag);

          const prioTag = document.createElement('span');
          const p = task.priority || 'medium';
          prioTag.className = 'tag tag-prio-' + p;
          prioTag.textContent = p.toUpperCase();
          badges.appendChild(prioTag);

          info.appendChild(badges);
          left.appendChild(chk);
          left.appendChild(info);

          const actions = document.createElement('div');
          const delBtn = document.createElement('button');
          delBtn.className = 'btn btn-danger btn-sm';
          delBtn.textContent = 'Delete';
          delBtn.onclick = async () => {
            const res = await fetch('/items/' + task.id, {
              method: 'DELETE',
              headers: { Authorization: 'Bearer ' + token }
            });
            if (res.status === 403) {
              alert('Delete restricted to admin role. Switch to Demo Admin to delete.');
            } else {
              loadTasks();
            }
          };

          actions.appendChild(delBtn);
          itemDiv.appendChild(left);
          itemDiv.appendChild(actions);
          container.appendChild(itemDiv);
        });
      }

      // Add Task
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

      // Filters
      document.querySelectorAll('.pill').forEach((btn) => {
        btn.onclick = () => {
          document.querySelectorAll('.pill').forEach((b) => b.classList.remove('active'));
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

      // Modal Handling
      const modal = document.getElementById('authModal');
      let isSignUp = false;

      function openAuthModal() { modal.style.display = 'flex'; }
      function closeAuthModal() { modal.style.display = 'none'; }

      document.getElementById('authActionBtn').onclick = openAuthModal;
      document.getElementById('closeModalBtn').onclick = closeAuthModal;

      document.getElementById('tabSignIn').onclick = () => {
        isSignUp = false;
        document.getElementById('tabSignIn').classList.add('active');
        document.getElementById('tabSignUp').classList.remove('active');
        document.getElementById('signUpNameWrapper').style.display = 'none';
        document.getElementById('authSubmitBtn').textContent = 'Sign In';
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
