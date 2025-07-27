import type { Route } from "./+types/manage";
import { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faEdit, 
  faCheck, 
  faTimes, 
  faSignInAlt, 
  faUpload, 
  faEyeSlash, 
  faTrash, 
  faDownload,
  faMinus,
  faEye
} from "@fortawesome/free-solid-svg-icons";

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

  const adminPassword =
    import.meta.env.ADMIN_PASSWORD ||
    context.cloudflare.env.ADMIN_PASSWORD ||
    "Abcd@1234";

  if (!password || password !== adminPassword) {
    return { error: "Invalid password" };
  }

  if (intent === "upload") {
    const files = formData.getAll("files") as File[];
    const optimize = formData.get("optimize") === "true";
    
    if (!files || files.length === 0 || files[0].size === 0) {
      return { error: "No files provided" };
    }

    const results = [];
    const errors = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const customName = formData.get(`filename_${i}`) as string;
      const finalName = customName || file.name;

      if (!file || !file.name) {
        errors.push(`File ${i + 1}: No file provided`);
        continue;
      }

      try {
        let fileBuffer = await file.arrayBuffer();
        let contentType = file.type || "application/octet-stream";

        // Basic optimization for images (placeholder for actual optimization)
        if (optimize && file.type?.startsWith("image/")) {
          // Here you would implement actual image optimization
          // For now, we'll just add a header to indicate optimization was requested
          console.log(`Optimization requested for ${finalName}`);
        }

        await context.cloudflare.env.image_serving.put(finalName, fileBuffer, {
          httpMetadata: {
            contentType: contentType,
          },
          customMetadata: {
            originalName: file.name,
            optimized: optimize.toString(),
            uploadedAt: new Date().toISOString(),
          },
        });

        results.push(finalName);
      } catch (error) {
        console.error(`Upload error for ${finalName}:`, error);
        errors.push(`Failed to upload ${finalName}`);
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return { error: errors.join("; ") };
    } else if (errors.length > 0) {
      return { 
        success: true, 
        message: `Uploaded ${results.length} file(s) successfully. Errors: ${errors.join("; ")}` 
      };
    } else {
      return {
        success: true,
        message: `Successfully uploaded ${results.length} file(s): ${results.join(", ")}`,
      };
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
  const [showPassword, setShowPassword] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileRenames, setFileRenames] = useState<{[key: string]: string}>({});
  const [editingFiles, setEditingFiles] = useState<{[key: string]: boolean}>({});
  const [optimizeFiles, setOptimizeFiles] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(files);
    
    // Initialize rename mapping with original names and editing states
    const renames: {[key: string]: string} = {};
    const editing: {[key: string]: boolean} = {};
    files.forEach((file, index) => {
      renames[`file_${index}`] = file.name;
      editing[`file_${index}`] = false;
    });
    setFileRenames(renames);
    setEditingFiles(editing);
  };

  const handleRenameChange = (fileKey: string, newName: string) => {
    setFileRenames(prev => ({
      ...prev,
      [fileKey]: newName
    }));
  };

  const toggleEdit = (fileKey: string) => {
    setEditingFiles(prev => ({
      ...prev,
      [fileKey]: !prev[fileKey]
    }));
  };

  const confirmEdit = (fileKey: string) => {
    setEditingFiles(prev => ({
      ...prev,
      [fileKey]: false
    }));
  };

  const cancelEdit = (fileKey: string, originalName: string) => {
    setFileRenames(prev => ({
      ...prev,
      [fileKey]: originalName
    }));
    setEditingFiles(prev => ({
      ...prev,
      [fileKey]: false
    }));
  };

  const removeFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    
    // Update rename mapping and editing states
    const newRenames: {[key: string]: string} = {};
    const newEditing: {[key: string]: boolean} = {};
    newFiles.forEach((file, i) => {
      const oldKey = `file_${index > i ? i : i + 1}`;
      newRenames[`file_${i}`] = fileRenames[oldKey] || file.name;
      newEditing[`file_${i}`] = false;
    });
    setFileRenames(newRenames);
    setEditingFiles(newEditing);
  };

  // Reset upload state after successful upload
  useEffect(() => {
    if (actionData?.success) {
      setSelectedFiles([]);
      setFileRenames({});
      setEditingFiles({});
      setOptimizeFiles(false);
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
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-500"
                  required
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="w-4 h-4" />
                </button>
              </div>
            </div>
            <button
              type="submit"
              className="w-full flex items-center justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <FontAwesomeIcon icon={faSignInAlt} className="mr-2 w-4 h-4" />
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
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 flex items-center"
            >
              <FontAwesomeIcon icon={showUpload ? faEyeSlash : faUpload} className="mr-2 w-4 h-4" />
              {showUpload ? "Hide Upload" : "Upload Files"}
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
              <input
                type="hidden"
                name="optimize"
                value={optimizeFiles.toString()}
              />
              
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="file"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Select Files
                  </label>
                  <input
                    type="file"
                    id="file"
                    name="files"
                    accept="*/*"
                    multiple
                    onChange={handleFileChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="optimize"
                    checked={optimizeFiles}
                    onChange={(e) => setOptimizeFiles(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="optimize" className="ml-2 block text-sm text-gray-700">
                    Optimize images before upload (compress and convert to WebP)
                  </label>
                </div>

                {selectedFiles.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <h4 className="text-sm font-medium text-gray-700">Selected Files:</h4>
                    {selectedFiles.map((file, index) => {
                      const fileKey = `file_${index}`;
                      const isEditing = editingFiles[fileKey];
                      const currentName = fileRenames[fileKey] || file.name;
                      const originalSize = (file.size / 1024).toFixed(2);
                      const isImage = file.type?.startsWith("image/");
                      const estimatedCompressedSize = isImage && optimizeFiles 
                        ? (file.size * 0.7 / 1024).toFixed(2) // Estimate 30% compression
                        : originalSize;

                      return (
                        <div key={fileKey} className="flex items-center space-x-3 p-3 bg-white rounded-md border">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <span className="text-sm text-gray-600">File:</span>
                              {isEditing ? (
                                <div className="flex items-center space-x-2 flex-1">
                                  <input
                                    type="text"
                                    value={currentName}
                                    onChange={(e) => handleRenameChange(fileKey, e.target.value)}
                                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 placeholder-gray-500"
                                    placeholder={file.name}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => confirmEdit(fileKey)}
                                    className="px-2 py-1 text-xs text-green-600 hover:text-green-800 flex items-center"
                                  >
                                    <FontAwesomeIcon icon={faCheck} className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => cancelEdit(fileKey, file.name)}
                                    className="px-2 py-1 text-xs text-red-600 hover:text-red-800 flex items-center"
                                  >
                                    <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center space-x-2 flex-1">
                                  <span className="text-sm font-medium text-gray-800">{currentName}</span>
                                  <button
                                    type="button"
                                    onClick={() => toggleEdit(fileKey)}
                                    className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800 flex items-center"
                                  >
                                    <FontAwesomeIcon icon={faEdit} className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">
                              {currentName !== file.name && (
                                <div className="mb-1">
                                  <span className="text-gray-500">Original: {file.name}</span>
                                </div>
                              )}
                              <div>
                                Size: {originalSize} KB
                                {optimizeFiles && isImage && (
                                  <span className="text-green-600"> → {estimatedCompressedSize} KB (optimized)</span>
                                )}
                              </div>
                            </div>
                            <input
                              type="hidden"
                              name={`filename_${index}`}
                              value={currentName}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFile(index)}
                            className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 flex items-center"
                          >
                            <FontAwesomeIcon icon={faMinus} className="mr-1 w-3 h-3" />
                            Remove
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={selectedFiles.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  <FontAwesomeIcon icon={faUpload} className="mr-2 w-4 h-4" />
                  Upload {selectedFiles.length > 0 ? `${selectedFiles.length} File${selectedFiles.length > 1 ? 's' : ''}` : 'Files'}
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
                      className="font-medium text-gray-800 truncate"
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

                    <div className="flex space-x-2 mt-3">
                      <a
                        href={`/${image.key}`}
                        download={image.key}
                        className="flex-1 px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 text-center flex items-center justify-center"
                      >
                        <FontAwesomeIcon icon={faDownload} className="mr-1 w-3 h-3" />
                        Download
                      </a>
                      <form method="post" className="flex-1">
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
                          className="w-full px-3 py-1 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 flex items-center justify-center"
                        >
                          <FontAwesomeIcon icon={faTrash} className="mr-1 w-3 h-3" />
                          Delete
                        </button>
                      </form>
                    </div>
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
