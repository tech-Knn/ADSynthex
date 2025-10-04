# Onboarding

Practical steps to get a working dev environment quickly.

## Prerequisites

- OS: Windows 10/11, macOS, or Linux
- Node.js: 18.x or later (see `"engines"` in `package.json`)
- Package manager: npm (or yarn, but examples use npm)
- Git installed

> <!-- Tip: On Windows, prefer PowerShell or Git Bash for commands. -->

## Setup

1. Clone the repo
   ```bash
   git clone https://github.com/nagdewaniharen/AdSyntheX.git
   cd AdSyntheX
   ```

2. Install dependencies
   ```bash
   npm install
   # or: npm ci   # if using a lockfile in CI
   ```

3. Configure environment variables
   - Create `./.env.local` in the project root with your credentials:
     ```env
     # Google Ads API
     GOOGLE_ADS_CLIENT_ID=your_client_id
     GOOGLE_ADS_CLIENT_SECRET=your_client_secret
     GOOGLE_ADS_DEVELOPER_TOKEN=your_developer_token
     GOOGLE_ADS_REFRESH_TOKEN=your_refresh_token
     GOOGLE_ADS_MANAGER_ID=your_manager_id

     # Ads.com API
     ADSCOM_API_KEY=your_api_key
     ADSCOM_API_SECRET=your_api_secret
     ```
   > <!-- Never commit secrets. .env.local is git-ignored by default in Next.js. -->

4. Run the app in development
   ```bash
   npm run dev
   # opens on http://localhost:3000
   ```

## Verifying Your Setup

- Open `http://localhost:3000` and ensure the app loads.
- Lint the project (Next.js ESLint):
  ```bash
  npm run lint
  ```
- Type check (Next.js runs type checks during build; you can also run tsc directly):
  ```bash
  npx tsc --noEmit
  ```
- Build production bundle:
  ```bash
  npm run build
  ```
- Start production server (after build):
  ```bash
  npm run start
  # serves on http://localhost:3000
  ```

## Project Scripts (from package.json)

- `npm run dev`: Next.js dev server
- `npm run build`: Production build
- `npm run start`: Start production server
- `npm run lint`: Run ESLint via Next.js
- `npm run clean`: Remove `.next` build artifacts

## Common Pitfalls

- Node version mismatch: ensure Node 18+ (use `node -v`)
- Missing env vars: 4xx/5xx from API routes often means a missing/invalid key
- Locked ports: if `:3000` is busy, set `PORT=3001` before `npm run dev`

## Troubleshooting

- Check terminal output for Next.js errors
- Inspect API route logs in the terminal when hitting endpoints
- If build fails, run lint and typecheck to identify issues:
  ```bash
  npm run lint && npx tsc --noEmit
  ```

> <!-- Add screenshots or short clips of first-run if helpful for newcomers. -->
