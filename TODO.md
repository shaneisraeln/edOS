# edOS — TODO

## ✅ Completed (V1 MVP + V2)

### Core Platform
- [x] Monorepo (pnpm + Turborepo)
- [x] Docker Compose (PostgreSQL + Redis)
- [x] NestJS Backend (all services)
- [x] Next.js Frontend (all pages)
- [x] Shared types package
- [x] Groq AI provider (provider-agnostic)
- [x] Swagger API docs (http://localhost:3001/docs)
- [x] Rate limiting + RBAC + Audit logging
- [x] CI/CD pipeline + Docker + K8s manifests
- [x] Unit tests

### Learning Engine
- [x] Knowledge Graph (concepts, nodes, edges, mastery)
- [x] Adaptive Assessments (AI-generated, contextual)
- [x] Context Quiz (observe screen → quiz on what you learned)
- [x] Learning Paths (AI-generated curriculum, step-by-step verification)
- [x] User-created curricula (first-class, same as pre-seeded)
- [x] Spaced repetition + knowledge decay (auto cron)
- [x] Memory Engine (short/medium/long term)
- [x] Recommendation Agent
- [x] Projects + AI Feedback
- [x] Learning Session tracking

### Agents & Extensions
- [x] Desktop Agent (Tauri + Rust) — window monitoring, quiz popup, system tray
- [x] Browser Extension (Chrome MV3) — page capture, context quiz, tab tracking
- [x] VS Code Extension — file/session tracking

### V2 Features
- [x] AI Mentor Chat
- [x] Study Groups + Leaderboard
- [x] Recruiter Dashboard (public profiles)
- [x] Interview Readiness Scoring
- [x] Notifications + Bell icon
- [x] Settings (permissions, devices)
- [x] College Dashboard (faculty view)
- [x] Admin Dashboard (users, analytics, audit)
- [x] WebSocket real-time updates

---

## ❌ Remaining (V3 Enterprise + Production)

### Production Hardening
- [x] Database migrations (TypeORM CLI, migrations folder, auto-run in prod)
- [x] Security headers (Helmet)
- [x] Request size limits (1MB max body)
- [x] Global error interceptor (Sentry-ready)
- [x] Global exception filter (clean error responses, hides internals in prod)
- [x] CORS hardening (environment-aware origins)
- [x] SSL support for database connections (Neon/Supabase ready)
- [ ] Real OAuth (Google, GitHub — needs credentials from you)
- [ ] Sentry integration (needs SENTRY_DSN from you)
- [ ] Performance profiling

### V3 Enterprise (PRD §65 — months 9-12)
- [ ] University Analytics
- [ ] Corporate Learning
- [ ] AI Career Coach
- [ ] Global Curriculum Marketplace
- [ ] Mobile Companion App

---

## How to Test Each Feature

### Start Services
```bash
pnpm db:up          # PostgreSQL + Redis (needs Docker)
pnpm dev:api        # Backend on http://localhost:3001
pnpm dev:web        # Frontend on http://localhost:3000
```

### Desktop Agent
```bash
# From project root:
E:\Porygon\Learning_OS\apps\desktop-agent\src-tauri\target\debug\edos-agent.exe
```
1. Sign in with your credentials
2. Open any educational app (VS Code, Chrome with docs)
3. Watch "Currently Monitoring" update every 3 seconds
4. Stay on educational content 60+ seconds, switch away → quiz popup appears

### Browser Extension
1. Go to `chrome://extensions` → Enable Developer mode
2. Click "Load unpacked" → select `apps/browser-extension/`
3. Click the extension icon → Sign in
4. Visit educational pages (MDN, StackOverflow, GitHub docs)
5. Spend 60+ seconds → close the tab → quiz popup appears

### Learning Paths
1. Go to http://localhost:3000/dashboard/paths
2. Type a topic (e.g. "Deep Learning") → Generate Path
3. See the step-by-step curriculum
4. Click "Verify" on the first step → answer questions → 60%+ passes

### AI Mentor Chat
1. Go to http://localhost:3000/dashboard/mentor
2. Ask any learning question (e.g. "What should I focus on?")
3. The AI knows your knowledge graph and weak areas

### Study Groups
1. Go to http://localhost:3000/dashboard/groups
2. Click "+ Create Group" → name it
3. See leaderboard (based on members' mastery scores)

### Interview Readiness
1. Go to http://localhost:3000/dashboard/interview
2. See your score ring (0-100) based on mastery, assessments, breadth

### Public Profile (Recruiter View)
1. Get your user ID from the API: `GET http://localhost:3001/api/auth/profile`
2. Visit: http://localhost:3000/profile/YOUR_USER_ID
3. Shows verified skills, projects, assessment history (public, no login needed)

### Context Quiz (Manual Test)
1. Go to http://localhost:3000/dashboard/quiz
2. Paste any article/documentation text
3. Click "Generate Quiz from Content"
4. Answer → get scored → knowledge graph updates

### Projects
1. Go to http://localhost:3000/dashboard/projects
2. Create a project → add technologies
3. Submit for AI review → get feedback + mastery update

### Knowledge Graph
1. Go to http://localhost:3000/dashboard/graph
2. After taking assessments, see concepts with mastery bars

### Notifications
1. Go to dashboard → see 🔔 bell icon (top right)
2. Trigger reminders: http://localhost:3001/docs → POST /api/notifications/generate-reminders

### Admin Dashboard
1. First make yourself admin: update your user role in DB or via API
2. Go to http://localhost:3000/admin
3. See platform analytics, manage users, view audit logs

### College Dashboard
1. Set your role to "faculty" 
2. Go to http://localhost:3000/college
3. See student progress, class weaknesses
