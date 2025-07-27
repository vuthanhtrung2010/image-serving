import type { Route } from "./+types/$filename";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const filename = params.filename;
  
  if (!filename) {
    throw new Response("Not Found", { status: 404 });
  }

  const url = new URL(request.url);
  const size = url.searchParams.get("size");
  const quality = url.searchParams.get("quality");
  const format = url.searchParams.get("format");
  const width = url.searchParams.get("width");
  const height = url.searchParams.get("height");

  try {
    const object = await context.cloudflare.env.image_serving.get(filename);
    
    if (!object) {
      throw new Response("File not found", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "public, max-age=31536000");

    // Check if this is an image and if any image processing parameters are provided
    const isImage = headers.get("content-type")?.startsWith("image/");
    const hasImageParams = size || quality || format || width || height;

    if (isImage && hasImageParams) {
      // Use Cloudflare Image Resizing
      const imageUrl = new URL(`https://imagedelivery.net/your-account-id/${filename}/public`);
      
      // Build transformation parameters
      const transformations: string[] = [];
      
      if (size) {
        // Predefined sizes
        switch (size.toLowerCase()) {
          case "thumb":
          case "thumbnail":
            transformations.push("w=150,h=150,fit=cover");
            break;
          case "small":
            transformations.push("w=300,h=300,fit=scale-down");
            break;
          case "medium":
            transformations.push("w=600,h=600,fit=scale-down");
            break;
          case "large":
            transformations.push("w=1200,h=1200,fit=scale-down");
            break;
          default:
            // Custom size format like "300x200"
            const sizeMatch = size.match(/^(\d+)x(\d+)$/);
            if (sizeMatch) {
              transformations.push(`w=${sizeMatch[1]},h=${sizeMatch[2]},fit=scale-down`);
            }
        }
      }

      if (width && !size) {
        transformations.push(`w=${width}`);
      }

      if (height && !size) {
        transformations.push(`h=${height}`);
      }

      if (quality) {
        const q = Math.min(100, Math.max(1, parseInt(quality) || 85));
        transformations.push(`q=${q}`);
      }

      if (format) {
        const validFormats = ["webp", "avif", "jpeg", "jpg", "png"];
        if (validFormats.includes(format.toLowerCase())) {
          transformations.push(`f=${format.toLowerCase()}`);
        }
      }

      // If we have transformations, we would normally use Cloudflare Images
      // For now, let's add the transformation info to headers for reference
      if (transformations.length > 0) {
        headers.set("x-image-transformations", transformations.join(","));
        // Note: Actual image transformation would require Cloudflare Images service
        // For now, we'll serve the original image with transformation headers
      }
    }

    // Add CORS headers for web usage
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");

    // Add custom headers for API usage
    headers.set("X-File-Name", filename);
    headers.set("X-File-Size", object.size.toString());

    return new Response(object.body, {
      headers,
    });
  } catch (error) {
    console.error("Error serving file:", error);
    throw new Response("Internal Server Error", { status: 500 });
  }
}
