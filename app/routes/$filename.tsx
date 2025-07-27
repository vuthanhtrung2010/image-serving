import type { Route } from "./+types/$filename";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const filename = params.filename;
  if (!filename) {
    throw new Response("Not Found", { status: 404 });
  }

  // @ts-expect-error TS dumbass not recognizing cf cache
  const cache = caches.default;
  const cacheKey = new Request(request.url, request);
  
  // Try returning a cached response
  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  // Not in cache: fetch from R2 and build response
  const object = await context.cloudflare.env.image_serving.get(filename);
  if (!object) {
    throw new Response("File not found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000");

  const isImage = headers.get("content-type")?.startsWith("image/");
  const url = new URL(request.url);
  const size = url.searchParams.get("size");
  const quality = url.searchParams.get("quality");
  const format = url.searchParams.get("format");
  const width = url.searchParams.get("width");
  const height = url.searchParams.get("height");
  const hasParams = size || quality || format || width || height;

  if (isImage && hasParams) {
    // Optional: add transformation info header
    const transformations: string[] = [];
    // (build transformations based on size/quality/format/width/height as you already do)
    headers.set("x-image-transformations", transformations.join(","));
  }

  // CORS and custom headers
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("X-File-Name", filename);
  headers.set("X-File-Size", object.size.toString());

  const response = new Response(object.body, { headers });

  // Write into Cache API with TTL control
  const putPromise = cache.put(cacheKey, response.clone());
  // Optionally wrap with waitUntil if you have context
  // context.waitUntil(putPromise);
  await putPromise;

  return response;
}
