# Memory DB Manager

A standalone admin UI for browsing and managing the Memory Database. Talks to [memory-database-api](https://github.com/etdofreshai/memory-database-api) via its REST API.

## Pages

- **Messages** — Browse, search, filter messages with pagination. Click to see details and linked attachments.
- **Cleanup** — Filter by source/channel/sender/date, preview impact, bulk delete with cascade.
- **Sources** — List all sources with message counts.
- **People** — Browse contacts/people table.
- **Attachments** — Browse attachments, filter by type, preview images/video/audio inline.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your API URL and token
npm run dev
```

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `VITE_MEMORY_API_URL` | Memory Database API base URL | `http://localhost:3000` |
| `VITE_MEMORY_API_TOKEN` | API bearer token | (empty) |

## Tech Stack

- Vite + React + TypeScript
- React Router for navigation
- Dark theme, responsive design
- No heavy UI frameworks — plain CSS

## Building

```bash
npm run build
# Output in dist/
```
