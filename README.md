# तपस्या (Tapasya) — Strict Discipline System

> **No flexibility. No excuses. Execute.**

Tapasya is a brutally strict task execution system designed to eliminate procrastination. You commit to tasks, lock the order, and execute sequentially — no switching, no skipping, no escape.

![Dark Theme](https://img.shields.io/badge/theme-dark-0a0a0f)
![Mobile First](https://img.shields.io/badge/responsive-mobile--first-7c6aff)
![No Backend](https://img.shields.io/badge/storage-localStorage-34d399)

---

## Philosophy

- **No flexibility after commitment** — once you begin, the order is locked
- **No silent skipping** — every task must be completed sequentially
- **No editing once execution starts** — plan before you commit
- **Every action requires conscious effort** — the system is deliberately strict
- **Finish or face the taunt** — incomplete tasks trigger accountability messages

---

## Features

### 🔒 Strict Sequential Execution
- Commit 1–3 tasks before starting
- Reorder only before beginning the cycle
- Once started: **Task 1 → Task 2 → Task 3**, no exceptions

### ⏱️ Timestamp-Based Timers
- **1.5 hours per task** (with a **20-minute break** between tasks), 6 hours max per cycle
- Timers use `Date.now()` — survives page refresh, tab close, and reopen
- Hourglass animation changes color: white → 🟠 orange (<30 min) → 🔴 red (<10 min)

### ⚠️ 20-Minute Discipline Checks
- Every 20 minutes: audio beep + modal confirmation
- Ignored checks escalate: *"Are you working or drifting?"*

### 🔥 Taunt System
After 6 hours, incomplete tasks trigger accountability:
- **1 incomplete**: *"You were close. But close is not discipline."*
- **2 incomplete**: *"You are avoiding effort. This is lack of control."*
- **3 incomplete**: *"You planned nothing. You executed nothing."*

### ✅ Task Completion Flow
1. Exit control: *"Have you truly completed this task?"*
2. Summary of what you accomplished
3. Satisfaction rating (1–10)
4. Auto-advance to next task

### 📱 Mobile-First Design
- Optimized for 320px–480px screens
- Sticky timer header
- Large touch targets
- Swipe navigation between task cards
- Safe area support for notched phones

### 💾 State Persistence
- Single `localStorage` object — survives refresh and tab close
- Export/Import state as JSON backup

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Structure | HTML5 |
| Styling | Vanilla CSS (mobile-first, dark theme) |
| Logic | Vanilla JavaScript (ES6+, IIFE) |
| Storage | localStorage only |
| Backend | None — fully client-side |

---

## Quick Start

### Run Locally

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/Tapasya.git
cd Tapasya

# Serve with any static server
python3 -m http.server 4000
# or
npx serve .
```

Open [http://localhost:4000](http://localhost:4000)

---

## Deploy to Vercel

Since Tapasya is a static site (HTML + CSS + JS), Vercel deployment is dead simple:

### Option 1: Vercel CLI (Fastest)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from project directory
cd Tapasya
vercel

# Follow prompts:
#   → Set up and deploy? Yes
#   → Which scope? (select your account)
#   → Link to existing project? No
#   → Project name? tapasya
#   → Directory with code? ./
#   → Override settings? No

# Deploy to production
vercel --prod
```

Your app will be live at `https://tapasya-YOUR_USERNAME.vercel.app`

### Option 2: GitHub + Vercel Dashboard (Recommended)

1. **Push to GitHub**:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/Tapasya.git
   git push -u origin main
   ```

2. **Connect to Vercel**:
   - Go to [vercel.com/new](https://vercel.com/new)
   - Click **"Import Git Repository"**
   - Select your `Tapasya` repo
   - Configure:
     - **Framework Preset**: `Other`
     - **Build Command**: *(leave empty)*
     - **Output Directory**: `./`
   - Click **Deploy**

3. **Done!** Every push to `main` will auto-deploy.

### Option 3: Drag & Drop

1. Go to [vercel.com/new](https://vercel.com/new)
2. Drag your project folder onto the page
3. Vercel deploys it instantly

---

## Git Branches

| Branch | Description |
|--------|-------------|
| `main` | **Strict mode** — no task switching, locked sequential order |
| `feature/switch-task-enabled` | Flexible mode — switch tasks with reason logging |

---

## Project Structure

```
Tapasya/
├── index.html     # App structure, modals, overlays
├── styles.css     # Mobile-first dark theme, animations
├── script.js      # State management, timers, discipline logic
└── README.md      # This file
```

---

## How It Works

```
┌─────────────────────────────────────┐
│         CREATION PHASE              │
│  • Add 1–3 tasks                    │
│  • Each: title + motivation + subs  │
│  • Reorder via drag & drop          │
│  • Click "Begin Cycle"              │
└──────────────┬──────────────────────┘
               │ ORDER LOCKED
               ▼
┌─────────────────────────────────────┐
│         EXECUTION PHASE             │
│  • Start Task 1 → timer begins     │
│  • Complete it → auto-advance       │
│  • Start Task 2 → timer begins     │
│  • Complete it → auto-advance       │
│  • Start Task 3 → timer begins     │
│  • Complete it → SUCCESS            │
│                                     │
│  Every 20 min: discipline check     │
│  After 6 hrs: taunt if incomplete   │
└─────────────────────────────────────┘
```

---

## License

MIT

---

*तपस्या (Tapasya) — Sanskrit for discipline, austerity, and focused effort.*