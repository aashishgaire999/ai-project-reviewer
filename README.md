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
- resolves the hostname and rejects it if **any** address is private, so a public name pointing at `10.0.0.5` is blocked
- follows redirects by hand (max 3) and re-checks every hop
- reads at most 1 MB of HTML

Known gap: the DNS check and the fetch resolve separately, so a DNS-rebinding attacker could in theory answer differently the second time. Pinning the resolved IP would close it.

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
| `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS` | Override the models. |
| `GITHUB_TOKEN` | Optional. Raises the GitHub API limit from 60 to 5,000 requests an hour. |

The rate limit is kept in memory, so on serverless hosts it slows abuse rather than capping it exactly, and it trusts `x-forwarded-for`, which is only reliable behind a proxy that sets it (Vercel does). Use a shared store before putting a paid key behind a public URL.

## Scripts

```bash
npm test          # Vitest: URL safety, review parsing, rate limiting, report export
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
