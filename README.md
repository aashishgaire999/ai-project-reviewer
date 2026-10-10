# Project Reviewer

**Live:** https://ai-project-reviewer-wine.vercel.app

Paste a public GitHub repo and get an honest code review, grounded in what is actually in the repo rather than in what its description claims.

It reads the repository's metadata, README, top-level files and language mix from the GitHub API, plus the visible text of the live site if you give one. Gemini then scores the project from 1 to 10 across code quality, originality, completeness and documentation, and lists strengths, problems and next steps.

Started as the review pipeline behind [Codyza](https://codyza.com), where every project submission gets an AI review. This is a standalone, open-source version.

## How it works

```
GitHub URL ─┐                         ┌─ repo metadata, README, files, languages
            ├─> /api/review ─ fetch ──┤
Live URL ───┘                         └─ live page title, meta, visible text
                      │
                      └─> Gemini (JSON mode) ─> validated review ─> page
```

- **Grounded prompt.** The model sees the fetched content and is told to say so when content is missing, instead of inventing specifics. Fetched text is marked as data, not instructions.
- **Untrusted output.** The model's JSON is validated: scores are clamped, malformed fields dropped, and a reply with no score is rejected and retried.
- **Real progress.** `/api/review` streams newline-delimited JSON events (`repo`, `site`, `review` steps, then a result or error), so the checklist on the page ticks off when the server actually finishes each step.
- **Fallback models.** The main model is tried twice, then lighter fallbacks that are rarely overloaded. If every attempt fails, the app says so rather than making up a score.

## Security

The server fetches URLs that visitors type in, which is a classic SSRF risk. Before fetching a live site it:

- only accepts `https://` on port 443, with no credentials in the URL
- rejects private, loopback, link-local, carrier-grade NAT and cloud-metadata addresses, IPv4 and IPv6, including IPv4-mapped IPv6
- resolves the hostname **inside the HTTP client's connect step** (an undici `Agent` with a custom `lookup`) and refuses it if **any** address is private. The socket connects only to the addresses that were just checked, so DNS rebinding (a safe answer for the check, a private one for the connection) has no gap to use
- follows redirects by hand (max 3) and re-checks every hop's URL; each hop's connection goes through the same pinned lookup
- reads at most 1 MB of HTML

`test/safe-url.test.ts` covers encoded hosts (`2130706433`, `0x7f.0.0.1`, `127.1`, `[::ffff:127.0.0.1]`), the pinned lookup, and a real local server that a plain lookup reaches but the pinned one never connects to.

## Running it

```bash
npm install
cp .env.example .env.local   # optional, see below
npm run dev
```

Open http://localhost:3000.

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Optional. Lets visitors review without their own key. Without it, visitors paste their own key, used for that request only and never stored. |
| `REVIEWS_PER_HOUR` | Reviews per IP per hour on the server's key. Default 5. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional. Shares the rate limit across all serverless instances. Vercel's Upstash integration sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`, which also work. |
| `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS` | Override the models. |
| `GITHUB_TOKEN` | Optional. Raises the GitHub API limit from 60 to 5,000 requests an hour. |

With Upstash configured, the rate limit is shared by every instance. Without it, each instance counts in its own memory, which slows abuse rather than capping it exactly. If Redis is down, the limiter falls back to memory rather than taking the site offline. It keys on `x-forwarded-for`, which is only reliable behind a proxy that sets it (Vercel does).

## Scripts

```bash
npm test          # Vitest: SSRF and DNS pinning, redirects, review parsing, rate limiting, report export
npm run typecheck
npm run lint
npm run build
```

## Stack

Next.js 16 (App Router, route handlers), React 19, TypeScript, Tailwind CSS 4, Framer Motion, Google Gen AI SDK, Vitest.

## Built with

Built with [Codyza](https://codyza.com).

## License

MIT
