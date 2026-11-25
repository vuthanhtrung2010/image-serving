import type { Route } from "./+types/$filename";
import { cloudflareContext } from "~/context";

// Only cache small, non-media full responses in Workers Cache API to avoid
// buffering large streams or calling Response.clone() / ReadableStream.tee().
const MAX_CACHEABLE_BYTES = 10 * 1024 * 1024; // 10 MiB

type ParsedRange =
  | { kind: "range"; offset: number; end?: number; r2Range: R2Range }
  | { kind: "suffix"; suffix: number; r2Range: R2Range };

function parseRangeHeader(header: string): ParsedRange | "unsatisfiable" | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) return null;

  const [, startStr, endStr] = match;
  if (!startStr && !endStr) return null;

  if (!startStr) {
    const suffix = Number(endStr);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return "unsatisfiable";
    return { kind: "suffix", suffix, r2Range: { suffix } };
  }

  const offset = Number(startStr);
  if (!Number.isSafeInteger(offset) || offset < 0) return "unsatisfiable";

  if (!endStr) {
    return { kind: "range", offset, r2Range: { offset } };
  }

  const end = Number(endStr);
  if (!Number.isSafeInteger(end) || end < offset) return "unsatisfiable";

  return {
    kind: "range",
    offset,
    end,
    r2Range: { offset, length: end - offset + 1 },
  };
}

function buildObjectHeaders(
  object: R2Object,
  filename: string,
  requestUrl: string
): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000");
  headers.set("accept-ranges", "bytes");

  const isImage = headers.get("content-type")?.startsWith("image/");
  const url = new URL(requestUrl);
  const size = url.searchParams.get("size");
  const quality = url.searchParams.get("quality");
  const format = url.searchParams.get("format");
  const width = url.searchParams.get("width");
  const height = url.searchParams.get("height");
  const hasParams = size || quality || format || width || height;

  if (isImage && hasParams) {
    const transformations: string[] = [];
    headers.set("x-image-transformations", transformations.join(","));
  }

  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Range");
  headers.set("X-File-Name", filename);
  headers.set("X-File-Size", object.size.toString());

  return headers;
}

function resolveRangeBounds(
  range: R2Range,
  totalSize: number
): { offset: number; length: number } {
  if ("suffix" in range) {
    const length = Math.min(range.suffix, totalSize);
    return { offset: totalSize - length, length };
  }
  const offset = range.offset ?? 0;
  const remaining = Math.max(0, totalSize - offset);
  const length =
    range.length !== undefined ? Math.min(range.length, remaining) : remaining;
  return { offset, length };
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const filename = params.filename;
  if (!filename) {
    throw new Response("Not Found", { status: 404 });
  }

  const { env, ctx } = context.get(cloudflareContext);
  const bucket = env.image_serving;
  if (!bucket) {
    throw new Response("Storage not configured", { status: 500 });
  }

  if (request.method === "HEAD") {
    const headObject = await bucket.head(filename);
    if (!headObject) {
      throw new Response("File not found", { status: 404 });
    }
    const headers = buildObjectHeaders(headObject, filename, request.url);
    headers.set("content-length", headObject.size.toString());
    return new Response(null, { status: 200, headers });
  }

  const rawRangeHeader = request.headers.get("range");
  const parsedRange = rawRangeHeader ? parseRangeHeader(rawRangeHeader) : null;

  if (parsedRange === "unsatisfiable") {
    const headObject = await bucket.head(filename);
    if (!headObject) {
      throw new Response("File not found", { status: 404 });
    }
    const headers = buildObjectHeaders(headObject, filename, request.url);
    headers.set("content-range", `bytes */${headObject.size}`);
    return new Response("Range Not Satisfiable", { status: 416, headers });
  }

  const cache = (caches as CacheStorage & { default?: Cache }).default;
  const cacheKey = new Request(request.url, { method: "GET" });

  // Serve cached full responses for non-range requests
  if (!parsedRange && cache) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }
  }

  let object: R2ObjectBody | R2Object | null;
  try {
    object = await bucket.get(
      filename,
      parsedRange ? { range: parsedRange.r2Range } : undefined
    );
  } catch (err) {
    if (parsedRange) {
      const headObject = await bucket.head(filename);
      if (!headObject) {
        throw new Response("File not found", { status: 404 });
      }
      const headers = buildObjectHeaders(headObject, filename, request.url);
      headers.set("content-range", `bytes */${headObject.size}`);
      return new Response("Range Not Satisfiable", { status: 416, headers });
    }
    throw err;
  }

  if (!object) {
    throw new Response("File not found", { status: 404 });
  }

  const headers = buildObjectHeaders(object, filename, request.url);

  if (!("body" in object)) {
    return new Response(null, { status: 304, headers });
  }

  if (parsedRange && object.range) {
    const requestedOutOfBounds =
      parsedRange.kind === "range" && parsedRange.offset >= object.size;
    const { offset, length } = resolveRangeBounds(object.range, object.size);

    if (requestedOutOfBounds || length === 0 || offset >= object.size) {
      await object.body.cancel();
      headers.set("content-range", `bytes */${object.size}`);
      return new Response("Range Not Satisfiable", { status: 416, headers });
    }

    const end = offset + length - 1;
    headers.set("content-range", `bytes ${offset}-${end}/${object.size}`);
    headers.set("content-length", length.toString());
    return new Response(object.body, { status: 206, headers });
  }

  headers.set("content-length", object.size.toString());

  const contentType = headers.get("content-type")?.toLowerCase() ?? "";
  const isMediaStream =
    contentType.startsWith("video/") || contentType.startsWith("audio/");
  const isCacheable =
    request.method === "GET" &&
    !parsedRange &&
    !isMediaStream &&
    object.size <= MAX_CACHEABLE_BYTES;

  if (isCacheable && cache) {
    // Read small non-media payloads once into memory instead of calling
    // response.clone() / ReadableStream.tee() so Cache API ingestion never
    // triggers tee buffer overflow when client and cache read at different rates.
    const body = await object.arrayBuffer();
    ctx.waitUntil(
      cache.put(cacheKey, new Response(body, { status: 200, headers }))
    );
    return new Response(body, { status: 200, headers });
  }

  // Stream large files and media directly from R2 without cloning or buffering.
  return new Response(object.body, { status: 200, headers });
}
