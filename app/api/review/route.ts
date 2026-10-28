import { fetchGithubContext, fetchLiveSiteContext } from "@/lib/context";
import { encodeEvent, type ReviewEvent } from "@/lib/events";
import { createLimiter } from "@/lib/rate-limit";
import { sharedPipeline } from "@/lib/redis";
import { generateReview, InvalidKeyError } from "@/lib/review";
import type { SavedReview } from "@/lib/review-types";
import { parseGithubRepo, parsePublicHttpsUrl } from "@/lib/safe-url";
import { canReuse, createStore, subjectForRepo, subjectForSite } from "@/lib/store";

export const maxDuration = 60;

const FETCH_TIMEOUT_MS = 5_000;
const REVIEW_BUDGET_MS = 50_000;
const redis = sharedPipeline();
const store = redis ? createStore(redis) : null;
const serverKeyLimit = createLimiter(Number(process.env.REVIEWS_PER_HOUR) || 5, 60 * 60 * 1000, redis);

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return fail(400, "Send a JSON body.");

  const githubInput = typeof body.githubUrl === "string" ? body.githubUrl.trim() : "";
  const liveInput = typeof body.liveUrl === "string" ? body.liveUrl.trim() : "";
  if (!githubInput && !liveInput) return fail(400, "Paste a GitHub repo, a live site, or both.");

  const repo = githubInput ? parseGithubRepo(githubInput) : null;
  if (githubInput && !repo) return fail(400, "Enter a public GitHub repository URL, like https://github.com/owner/repo.");
  const liveUrl = liveInput ? parsePublicHttpsUrl(liveInput) : null;
  if (liveInput && !liveUrl) return fail(400, "The live URL must be a public https:// address.");

  const description = typeof body.description === "string" ? body.description.trim().slice(0, 1000) : "";
  const visitorKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const share = body.share !== false;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const deadline = Date.now() + REVIEW_BUDGET_MS;

  // Validation errors above return plain JSON with a status code. From here
  // on the response is a stream of progress events ending in a result or error.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ReviewEvent) => controller.enqueue(encodeEvent(event));
      const error = (message: string) => send({ type: "error", error: message });
      try {
        send({ type: "step", step: "repo", status: repo ? "running" : "skipped" });
        send({ type: "step", step: "site", status: liveUrl ? "running" : "skipped" });
        const [github, liveSiteContext] = await Promise.all([
          repo
            ? fetchGithubContext(repo.owner, repo.repo, FETCH_TIMEOUT_MS).then((context) => {
                send({ type: "step", step: "repo", status: context ? "done" : "failed" });
                return context;
              })
            : Promise.resolve(null),
          liveUrl
            ? fetchLiveSiteContext(liveUrl, FETCH_TIMEOUT_MS).then((context) => {
                send({ type: "step", step: "site", status: context ? "done" : "failed" });
                return context;
              })
            : Promise.resolve(null),
        ]);
        if (repo && !github) return error("Couldn't read that repository. Check it exists and is public.");
        if (!repo && !liveSiteContext) return error("Couldn't load that site. Check the address opens in a browser.");

        const [owner, name] = (github?.fullName ?? "").split("/");
        const subject = repo ? subjectForRepo(owner || repo.owner, name || repo.repo) : subjectForSite(liveUrl!);
        const version = github?.pushedAt ?? null;

        // Same subject, same version: hand back the saved review. Re-running
        // would only give a different number for the same code.
        const saved = store ? await store.get(subject.key).catch(() => null) : null;
        if (saved && canReuse(saved, version)) {
          if (share && !saved.public) await store!.save({ ...saved, public: true }).catch(() => {});
          send({ type: "step", step: "review", status: "done" });
          send({ type: "result", review: saved.review, subject: saved.subject, reviewedAt: saved.reviewedAt, reused: true });
          return;
        }

        // A visitor's own key is used for this one request and never stored.
        // The server's key, if configured, is rate limited per IP.
        let apiKey = visitorKey;
        if (!apiKey) {
          apiKey = process.env.GEMINI_API_KEY || "";
          if (!apiKey) return error("This server has no Gemini key. Paste your own key under More options.");
          const { allowed, retryAfterSeconds } = await serverKeyLimit(ip);
          if (!allowed) {
            return error(`Free review limit reached. Try again in ${Math.ceil(retryAfterSeconds / 60)} min, or paste your own Gemini key.`);
          }
        }

        send({ type: "step", step: "review", status: "running" });
        const review = await generateReview(
          {
            githubUrl: repo ? subject.url : null,
            liveUrl: liveUrl?.toString() ?? null,
            description,
            githubContext: github?.text ?? null,
            liveSiteContext,
          },
          apiKey,
          deadline,
        );
        if (!review) {
          send({ type: "step", step: "review", status: "failed" });
          return error("The AI didn't return a usable review. Try again in a minute.");
        }

        const record: SavedReview = { subject, version, review, reviewedAt: new Date().toISOString(), public: share || Boolean(saved?.public) };
        if (store) await store.save(record).catch((e) => console.error("Saving review failed", String(e).slice(0, 200)));
        send({ type: "step", step: "review", status: "done" });
        send({ type: "result", review, subject, reviewedAt: record.reviewedAt, reused: false });
      } catch (e) {
        send({ type: "step", step: "review", status: "failed" });
        if (e instanceof InvalidKeyError) {
          error(visitorKey ? "That Gemini API key isn't valid. Check it and try again." : "The server's Gemini key is misconfigured.");
        } else {
          console.error("Review failed", e);
          error("Something went wrong on the server. Try again.");
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
