# VentureLift Innovation Platform

A dependency-free full-stack prototype for an entrepreneurial support and innovation platform.

## Features

- Interactive founder dashboard
- Venture profile builder
- SQLite database storage
- AI idea validation endpoint
- NLP-style pitch and market signal analyzer
- Local fallback analysis when no API key is configured

## Run

Install dependencies first:

```powershell
npm install
```

Then start the server:

```powershell
npm start
```

Open:

```text
http://127.0.0.1:8000
```

## Connect AI

Set an API key before running the server:

```powershell
$env:OPENAI_API_KEY="sk-your-openai-api-key"
$env:AI_MODEL="gpt-5.4-mini"
npm start
```

If you prefer a different variable name, the server also accepts `ADVANCED_AI_API_KEY` as an alias for `OPENAI_API_KEY`.

## Optional Supabase replication

If you want the app to replicate users, ventures, and AI reports to Supabase, add these environment variables:

```powershell
$env:SUPABASE_URL="https://your-supabase-project-ref.supabase.co"
$env:SUPABASE_KEY="your-supabase-key"
npm start
```

The server will continue to use the local SQLite database for primary storage while optionally sending copies of new users, ventures, and AI reports to your Supabase project.

## Deploy to Vercel

For Vercel, the app uses a serverless API route and shared backend logic from `lib/backend.mjs`.

Set environment variables in Vercel for production:

- `JWT_SECRET` (any long random secret)
- `SUPABASE_URL` and `SUPABASE_KEY` if you want remote replication
- `OPENAI_API_KEY` / `ADVANCED_AI_API_KEY` and `AI_MODEL` for AI support

If you do not configure Supabase, the app will still run using the local SQLite `venture_platform.db` file in development, but Vercel deployments should use Supabase for persistent storage.

## Demo logins

```text
Founder: founder@venturelift.local / Founder@123
Mentor: mentor@venturelift.local / Mentor@123
Admin: admin@venturelift.local / Admin@123
```

New founder and mentor accounts can also be created from the Register screen.

## Database

The app creates `venture_platform.db` automatically in the project folder. It stores users, sessions, venture profiles, and AI/NLP reports using Node's built-in SQLite support.
