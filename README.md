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

```powershell
node server.mjs
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
node server.mjs
```

If you prefer a different variable name, the server also accepts `ADVANCED_AI_API_KEY` as an alias for `OPENAI_API_KEY`.

## Demo logins

```text
Founder: founder@venturelift.local / Founder@123
Mentor: mentor@venturelift.local / Mentor@123
Admin: admin@venturelift.local / Admin@123
```

New founder and mentor accounts can also be created from the Register screen.

## Database

The app creates `venture_platform.db` automatically in the project folder. It stores users, sessions, venture profiles, and AI/NLP reports using Node's built-in SQLite support.
