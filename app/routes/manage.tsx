import type { Route } from "./+types/manage";
import { useState, useEffect } from "react";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Image Management" },
    { name: "description", content: "Manage your images" },
  ];
}

interface ImageItem {
  key: string;
  size: number;
  uploaded: string;
  etag: string;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const password = url.searchParams.get("password");

  // Use import.meta.env instead of process.env for Cloudflare Workers
  const adminPassword =
    process.env.ADMIN_PASSWORD ||
    import.meta.env.ADMIN_PASSWORD ||
    context.cloudflare.env.ADMIN_PASSWORD ||
    "Abcd@1234";

  if (!password || password !== adminPassword) {
    return { authenticated: false, images: [], password: password || "" };
  }

  // List all objects in R2 bucket
  try {
    const objects = await context.cloudflare.env.image_serving.list();
    const images: ImageItem[] = objects.objects.map((obj: any) => ({
      key: obj.key,
      size: obj.size,
      uploaded: obj.uploaded.toISOString(),
      etag: obj.etag,
    }));

    return { authenticated: true, images, password: password || "" };
  } catch (error) {
    console.error("Error listing images:", error);
    return { authenticated: true, images: [], password: password || "" };
  }
}

export async function action({ request, context }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");
  const password = formData.get("password");

  // Use import.meta.env instead of process.env for Cloudflare Workers
  const adminPassword = import.meta.env.ADMIN_PASSWORD || "Abcd@1234";

  if (!password || password !== adminPassword) {
    return { error: "Invalid password" };
  }

  if (intent === "upload") {
    const file = formData.get("file") as File;
    if (!file || !file.name) {
      return { error: "No file provided" };
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      await context.cloudflare.env.image_serving.put(file.name, arrayBuffer, {
        httpMetadata: {
          contentType: file.type || "application/octet-stream",
        },
      });

      return {
        success: true,
        message: `File ${file.name} uploaded successfully`,
      };
    } catch (error) {
      console.error("Upload error:", error);
      return { error: "Failed to upload file" };
    }
  }

  if (intent === "delete") {
    const filename = formData.get("filename") as string;
    if (!filename) {
      return { error: "No filename provided" };
    }

    try {
      await context.cloudflare.env.image_serving.delete(filename);
      return {
        success: true,
        message: `File ${filename} deleted successfully`,
      };
    } catch (error) {
      console.error("Delete error:", error);
      return { error: "Failed to delete file" };
    }
  }

  return { error: "Invalid action" };
}

export default function Manage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const [password, setPassword] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
  };

  // Reset upload state after successful upload
  useEffect(() => {
    if (actionData?.success) {
      setSelectedFile(null);
      setShowUpload(false);
      // Reset file input
      const fileInput = document.getElementById("file") as HTMLInputElement;
      if (fileInput) {
        fileInput.value = "";
      }
    }
  }, [actionData]);

  if (!loaderData.authenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Admin Login</h1>
          <form method="get" className="space-y-4">
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700"
              >
                Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return (
      new Date(dateString).toLocaleDateString() +
      " " +
      new Date(dateString).toLocaleTimeString()
    );
  };

  const isImageFile = (filename: string) => {
    const imageExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".svg",
      ".bmp",
      ".ico",
    ];
    return imageExtensions.some((ext) => filename.toLowerCase().endsWith(ext));
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.toLowerCase().split(".").pop();
    switch (ext) {
      case "pdf":
        return "📄";
      case "doc":
      case "docx":
        return "📝";
      case "xls":
      case "xlsx":
        return "📊";
      case "ppt":
      case "pptx":
        return "📈";
      case "zip":
      case "rar":
      case "7z":
        return "🗜️";
      case "mp4":
      case "avi":
      case "mov":
        return "🎥";
      case "mp3":
      case "wav":
      case "flac":
        return "🎵";
      default:
        return "📁";
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-bold text-gray-900">
              Image Management
            </h1>
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {showUpload ? "Hide Upload" : "Upload Image"}
            </button>
          </div>

          {actionData?.error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {actionData.error}
            </div>
          )}

          {actionData?.success && (
            <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
              {actionData.message}
            </div>
          )}

          {showUpload && (
            <form
              method="post"
              encType="multipart/form-data"
              className="mb-6 p-4 bg-gray-50 rounded-lg"
            >
              <input type="hidden" name="intent" value="upload" />
              <input
                type="hidden"
                name="password"
                value={loaderData.password}
              />
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="file"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Select File
                  </label>
                  <input
                    type="file"
                    id="file"
                    name="file"
                    accept="*/*"
                    onChange={handleFileChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    required
                  />
                  {selectedFile && (
                    <div className="mt-2 p-2 bg-blue-50 rounded-md">
                      <p className="text-sm text-gray-700">
                        <span className="font-medium">Selected file:</span>{" "}
                        {selectedFile.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        Size: {(selectedFile.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={!selectedFile}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Upload File
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Images ({loaderData.images.length})
          </h2>

          {loaderData.images.length === 0 ? (
            <p className="text-gray-500">No images found.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {loaderData.images.map((image: ImageItem) => (
                <div
                  key={image.key}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="mb-3">
                    {isImageFile(image.key) ? (
                      <>
                        <img
                          src={`/${image.key}`}
                          alt={image.key}
                          className="w-full h-48 object-cover rounded-md"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = "none";
                            target.nextElementSibling!.classList.remove(
                              "hidden"
                            );
                          }}
                        />
                        <div className="hidden w-full h-48 bg-gray-200 rounded-md flex items-center justify-center">
                          <span className="text-gray-500">
                            Preview not available
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-48 bg-gray-100 rounded-md flex flex-col items-center justify-center">
                        <span className="text-6xl mb-2">
                          {getFileIcon(image.key)}
                        </span>
                        <span className="text-sm text-gray-600 font-medium">
                          {image.key.split(".").pop()?.toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h3
                      className="font-medium text-gray-900 truncate"
                      title={image.key}
                    >
                      {image.key}
                    </h3>
                    <p className="text-sm text-gray-600">
                      Size: {formatFileSize(image.size)}
                    </p>
                    <p className="text-sm text-gray-600">
                      Uploaded: {formatDate(image.uploaded)}
                    </p>

                    <form method="post" className="mt-3">
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="filename" value={image.key} />
                      <input
                        type="hidden"
                        name="password"
                        value={loaderData.password}
                      />
                      <button
                        type="submit"
                        onClick={(e) => {
                          if (
                            !confirm(
                              `Are you sure you want to delete ${image.key}?`
                            )
                          ) {
                            e.preventDefault();
                          }
                        }}
                        className="w-full px-3 py-1 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
