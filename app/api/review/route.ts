import { fetchGithubContext, fetchLiveSiteContext } from "@/lib/context";
import { createRateLimiter } from "@/lib/rate-limit";
import { encodeEvent, type ReviewEvent } from "@/lib/events";
import { generateReview, InvalidKeyError } from "@/lib/review";
import { parseGithubRepo, parsePublicHttpsUrl } from "@/lib/safe-url";

export const maxDuration = 60;

const FETCH_TIMEOUT_MS = 5_000;
const REVIEW_BUDGET_MS = 50_000;
const serverKeyLimit = createRateLimiter(Number(process.env.REVIEWS_PER_HOUR) || 5, 60 * 60 * 1000);

const fail = (status: number, error: string, headers?: HeadersInit) => Response.json({ error }, { status, headers });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return fail(400, "Send a JSON body.");

  const repo = parseGithubRepo(body.githubUrl);
  if (!repo) return fail(400, "Enter a public GitHub repository URL, like https://github.com/owner/repo.");

  let liveUrl: URL | null = null;
  if (typeof body.liveUrl === "string" && body.liveUrl.trim()) {
    liveUrl = parsePublicHttpsUrl(body.liveUrl);
    if (!liveUrl) return fail(400, "The live URL must be a public https:// address.");
  }

  const description = typeof body.description === "string" ? body.description.trim().slice(0, 1000) : "";
  const visitorKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";

  // A visitor's own key is used for this one request and never stored.
  // The server's key, if configured, is rate limited per IP.
  let apiKey = visitorKey;
  if (!apiKey) {
    apiKey = process.env.GEMINI_API_KEY || "";
    if (!apiKey) return fail(400, "This server has no Gemini key. Paste your own key to run a review.");
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { allowed, retryAfterSeconds } = serverKeyLimit(ip);
    if (!allowed) {
      return fail(429, `Free review limit reached. Try again in ${Math.ceil(retryAfterSeconds / 60)} min, or paste your own Gemini key.`, {
        "Retry-After": String(retryAfterSeconds),
      });
    }
  }

  const deadline = Date.now() + REVIEW_BUDGET_MS;
  const repository = `${repo.owner}/${repo.repo}`;

  // Validation errors above return plain JSON with a status code. From here
  // on the response is a stream of progress events ending in a result or error.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ReviewEvent) => controller.enqueue(encodeEvent(event));
      try {
        send({ type: "step", step: "repo", status: "running" });
        send({ type: "step", step: "site", status: liveUrl ? "running" : "skipped" });
        const [githubContext, liveSiteContext] = await Promise.all([
          fetchGithubContext(repo.owner, repo.repo, FETCH_TIMEOUT_MS).then((context) => {
            send({ type: "step", step: "repo", status: context ? "done" : "failed" });
            return context;
          }),
          liveUrl
            ? fetchLiveSiteContext(liveUrl, FETCH_TIMEOUT_MS).then((context) => {
                send({ type: "step", step: "site", status: context ? "done" : "failed" });
                return context;
              })
            : Promise.resolve(null),
        ]);
        if (!githubContext) {
          send({ type: "error", error: "Couldn't read that repository. Check it exists and is public." });
          return;
        }

        send({ type: "step", step: "review", status: "running" });
        const review = await generateReview(
          {
            githubUrl: `https://github.com/${repository}`,
            liveUrl: liveUrl?.toString() ?? null,
            description,
            githubContext,
            liveSiteContext,
          },
          apiKey,
          deadline,
        );
        if (!review) {
          send({ type: "step", step: "review", status: "failed" });
          send({ type: "error", error: "The AI didn't return a usable review. Try again in a minute." });
          return;
        }
        send({ type: "step", step: "review", status: "done" });
        send({ type: "result", review, repository });
      } catch (error) {
        send({ type: "step", step: "review", status: "failed" });
        send({
          type: "error",
          error:
            error instanceof InvalidKeyError
              ? visitorKey
                ? "That Gemini API key isn't valid. Check it and try again."
                : "The server's Gemini key is misconfigured."
              : "Something went wrong on the server. Try again.",
        });
        if (!(error instanceof InvalidKeyError)) console.error("Review failed", error);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
