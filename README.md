# DailyBricks.io 🧱

> Duolingo for Databricks data engineers. 5 minutes a day. Free.

## Deploy to Vercel (free, ~5 minutes)

### Step 1 — Install and run locally first

```bash
npm install
npm run dev
# Open http://localhost:5173 — you should see DailyBricks
```

### Step 2 — Push to GitHub

```bash
git init
git add .
git commit -m "Launch DailyBricks"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/dailybricks.git
git push -u origin main
```

### Step 3 — Deploy to Vercel

**Option A — Via CLI (fastest):**
```bash
npm install -g vercel
vercel
# Answer the prompts, it auto-detects Vite
# Your URL: https://dailybricks.vercel.app ✅
```

**Option B — Via GitHub (easiest ongoing):**
1. Go to https://vercel.com → Sign up free with GitHub
2. Click "Add New Project"
3. Import your `dailybricks` repo
4. Click Deploy — done in 60 seconds
5. Every `git push` auto-deploys from now on

### Your live URL
```
https://dailybricks.vercel.app
```
Share this anywhere — LinkedIn, Twitter, WhatsApp. Free forever.

---

## Tech stack
- React 18 + Vite
- Zero backend
- localStorage for progress persistence
- All styling inline (no Tailwind, no CSS files needed)
- Single JSX file = entire app

## Cost
| Item | Cost |
|------|------|
| Hosting (Vercel) | Free forever |
| SSL certificate | Free (Vercel auto) |
| Custom domain (optional) | ~$10/yr |
| Everything else | Free |

**Total to launch: $0**
