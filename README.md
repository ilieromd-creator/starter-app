# Starter App (Supabase + Express + Render)

A full-stack TypeScript production starter with Express, Supabase (PostgreSQL + Auth + Row Level Security), role-based access control (RBAC), and interactive frontend.

---

## 🚀 Features

- **Express & TypeScript API**: Structured architecture with modules and services.
- **Supabase Persistence & Auth**: PostgreSQL database with Row-Level Security (RLS) policies per user (`auth.uid() = user_id`).
- **Role-Based Authorization (RBAC)**: Support for `admin` and standard `user` roles.
- **Modern Web Interface**: Responsive Todo client with authentication and CRUD actions.
- **Production Health & Metrics**:
  - `GET /health` - Service health status.
  - `GET /metrics` - Uptime and server startup metadata.
  - `GET /logs` - Live request telemetry.
- **Ready for Cloud Deployments**: Pre-configured for Render and Docker.

---

## 🛠️ Step 1: Configure Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor** in your Supabase Dashboard.
3. Open and run the migration script from [`supabase/schema.sql`](supabase/schema.sql).
4. Copy your project credentials from **Project Settings > API**:
   - `Project URL` (`SUPABASE_URL`)
   - `anon public` key (`SUPABASE_ANON_KEY`)
   - `service_role` key (`SUPABASE_SERVICE_ROLE_KEY`)

---

## 💻 Step 2: Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```
   Add your `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

3. Run in development mode:
   ```bash
   npm run dev
   ```

4. Run tests:
   ```bash
   npm test
   ```

5. Build for production:
   ```bash
   npm run build
   npm start
   ```

---

## 📦 Step 3: Publish to GitHub

1. Initialize Git & commit (if not already done):
   ```bash
   git add .
   git commit -m "feat: migrate to Supabase and configure Render deployment"
   ```

2. Link to your GitHub repository:
   ```bash
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git branch -M main
   git push -u origin main
   ```

---

## 🌐 Step 4: Deploy on Render

1. Log in to [Render](https://render.com) and click **New + > Web Service**.
2. Connect your GitHub repository.
3. Configure the service:
   - **Name**: `starter-app`
   - **Environment**: `Node`
   - **Plan**: `Free`
   - **Build Command**:
     ```bash
     npm install && npm run build
     ```
   - **Start Command**:
     ```bash
     npm run start
     ```
4. Set the **Environment Variables**:
   | Variable | Value | Description |
   |---|---|---|
   | `NODE_VERSION` | `22.12.0` | Node.js version |
   | `PORT` | `10000` | Port used by Render |
   | `JWT_SECRET` | *(generate random 32+ chars)* | Session encryption secret |
   | `SUPABASE_URL` | `https://<project-ref>.supabase.co` | Your Supabase project URL |
   | `SUPABASE_ANON_KEY` | `<your-supabase-anon-key>` | Supabase Public Anon Key |
   | `SUPABASE_SERVICE_ROLE_KEY` | `<your-supabase-service-key>` | Supabase Service Role Key |

---

## 🔍 Verification After Deployment

Once deployed, verify your live service:

- **Web App**: `https://<app-name>.onrender.com/`
- **Frontend Assets**: `https://<app-name>.onrender.com/app/index.html`
- **Health Check**: `https://<app-name>.onrender.com/health` (Returns `{"status":"ok","service":"starter-app"}`)
- **Metrics**: `https://<app-name>.onrender.com/metrics`
