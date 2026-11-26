import type { Route } from "./+types/api.upload";
import { cloudflareContext } from "~/context";
import { getAdminPassword } from "~/lib/auth.server";

function decodeHeaderValue(value: string | null): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST" && request.method !== "PUT") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { env } = context.get(cloudflareContext);
  const password = decodeHeaderValue(request.headers.get("x-admin-password"));
  const adminPassword = getAdminPassword(env);

  if (!password || password !== adminPassword) {
    return Response.json({ error: "Invalid password" }, { status: 401 });
  }

  if (!env.image_serving) {
    return Response.json(
      { error: "Storage bucket is not configured" },
      { status: 500 }
    );
  }

  const filename = decodeHeaderValue(request.headers.get("x-filename")).trim();
  const originalName =
    decodeHeaderValue(request.headers.get("x-original-filename")).trim() ||
    filename;
  const optimize = request.headers.get("x-optimize") === "true";

  if (!filename) {
    return Response.json({ error: "No filename provided" }, { status: 400 });
  }

  const contentType =
    request.headers.get("content-type") || "application/octet-stream";
  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader
    ? Number(contentLengthHeader)
    : NaN;

  try {
    if (optimize && contentType.startsWith("image/")) {
      console.log(`Optimization requested for ${filename}`);
    }

    // Stream directly to R2 when Content-Length is known so large uploads
    // don't buffer in Worker memory; fall back to ArrayBuffer if chunked.
    const body: ReadableStream | ArrayBuffer | Uint8Array = !request.body
      ? new Uint8Array(0)
      : Number.isFinite(contentLength) && contentLength >= 0
        ? request.body
        : await request.arrayBuffer();

    const uploaded = await env.image_serving.put(filename, body, {
      httpMetadata: {
        contentType,
      },
      customMetadata: {
        originalName,
        optimized: optimize.toString(),
        uploadedAt: new Date().toISOString(),
      },
    });

    return Response.json({
      success: true,
      filename,
      size: uploaded?.size ?? (Number.isFinite(contentLength) ? contentLength : 0),
    });
  } catch (error) {
    console.error(`Upload error for ${filename}:`, error);
    return Response.json(
      { error: `Failed to upload ${filename}` },
      { status: 500 }
    );
  }
}
