import type { Route } from "./+types/manage";
import { useState, useEffect, useRef } from "react";
import { useRevalidator } from "react-router";
import { cloudflareContext } from "~/context";
import { getAdminPassword } from "~/lib/auth.server";
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

type FileUploadStatus = "queued" | "uploading" | "finalizing" | "done" | "error" | "cancelled";

interface UploadProgressState {
  active: boolean;
  currentIndex: number;
  totalFiles: number;
  currentFileName: string;
  uploadedBytes: number;
  totalBytes: number;
  elapsedMs: number;
  speedBps: number;
  finalizing: boolean;
  fileStatuses: FileUploadStatus[];
  filePercents: number[];
}

interface UploadResultBanner {
  type: "success" | "error" | "info";
  message: string;
}

interface SpeedSample {
  time: number;
  bytes: number;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }
  const roundedSeconds = Math.floor(totalSeconds);
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const seconds = roundedSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

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
  const { env } = context.get(cloudflareContext);
  const url = new URL(request.url);
  const password = url.searchParams.get("password");

  // Use shared password lookup helper
  const adminPassword = getAdminPassword(env);

  if (!password || password !== adminPassword) {
    return { authenticated: false, images: [], password: password || "" };
  }

  // List all objects in R2 bucket
  try {
    if (!env.image_serving) {
      throw new Error("R2 bucket binding image_serving is not configured");
    }
    const objects = await env.image_serving.list();
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
  const { env } = context.get(cloudflareContext);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const password = formData.get("password");

  const adminPassword = getAdminPassword(env);

  if (!password || password !== adminPassword) {
    return { error: "Invalid password" };
  }

  if (!env.image_serving) {
    return { error: "Storage bucket is not configured" };
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

        await env.image_serving.put(finalName, fileBuffer, {
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
      await env.image_serving.delete(filename);
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
  const revalidator = useRevalidator();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileRenames, setFileRenames] = useState<{[key: string]: string}>({});
  const [editingFiles, setEditingFiles] = useState<{[key: string]: boolean}>({});
  const [optimizeFiles, setOptimizeFiles] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState | null>(null);
  const [uploadBanner, setUploadBanner] = useState<UploadResultBanner | null>(null);

  const activeXhrRef = useRef<XMLHttpRequest | null>(null);
  const cancelRequestedRef = useRef(false);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopElapsedTimer = () => {
    if (elapsedTimerRef.current !== null) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopElapsedTimer();
      activeXhrRef.current?.abort();
    };
  }, []);

  const resetUploadSelection = () => {
    setSelectedFiles([]);
    setFileRenames({});
    setEditingFiles({});
    setOptimizeFiles(false);
    const fileInput = document.getElementById("file") as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(files);
    setUploadBanner(null);
    setUploadProgress(null);

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

  const uploadSingleFile = (
    file: File,
    finalName: string,
    onProgress: (loadedBytes: number) => void
  ): Promise<{ ok: boolean; error?: string; aborted?: boolean }> => {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      activeXhrRef.current = xhr;

      xhr.open("POST", "/api/upload");
      xhr.setRequestHeader("X-Admin-Password", encodeURIComponent(loaderData.password));
      xhr.setRequestHeader("X-Filename", encodeURIComponent(finalName));
      xhr.setRequestHeader("X-Original-Filename", encodeURIComponent(file.name));
      xhr.setRequestHeader("X-Optimize", String(optimizeFiles));
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.min(event.loaded, file.size));
        }
      };

      xhr.onload = () => {
        activeXhrRef.current = null;
        let payload: { success?: boolean; error?: string } | null = null;
        try {
          payload = JSON.parse(xhr.responseText);
        } catch {
          payload = null;
        }
        if (xhr.status >= 200 && xhr.status < 300 && payload?.success) {
          onProgress(file.size);
          resolve({ ok: true });
        } else {
          resolve({
            ok: false,
            error: payload?.error || `Failed to upload ${finalName} (HTTP ${xhr.status})`,
          });
        }
      };

      xhr.onerror = () => {
        activeXhrRef.current = null;
        resolve({ ok: false, error: `Network error uploading ${finalName}` });
      };

      xhr.onabort = () => {
        activeXhrRef.current = null;
        resolve({ ok: false, aborted: true });
      };

      xhr.send(file);
    });
  };

  const handleCancelUpload = () => {
    cancelRequestedRef.current = true;
    activeXhrRef.current?.abort();
  };

  const handleUploadSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (selectedFiles.length === 0 || uploadProgress?.active) return;

    const filesToUpload = [...selectedFiles];
    const totalBytes = filesToUpload.reduce((sum, f) => sum + f.size, 0);
    const startTime = Date.now();
    cancelRequestedRef.current = false;
    setUploadBanner(null);

    const fileStatuses: FileUploadStatus[] = filesToUpload.map(() => "queued");
    const filePercents: number[] = filesToUpload.map(() => 0);
    const samples: SpeedSample[] = [{ time: startTime, bytes: 0 }];

    let completedBytes = 0;
    let succeededBytes = 0;
    const uploadedNames: string[] = [];
    const errors: string[] = [];

    setUploadProgress({
      active: true,
      currentIndex: 0,
      totalFiles: filesToUpload.length,
      currentFileName: fileRenames.file_0 || filesToUpload[0].name,
      uploadedBytes: 0,
      totalBytes,
      elapsedMs: 0,
      speedBps: 0,
      finalizing: false,
      fileStatuses: [...fileStatuses],
      filePercents: [...filePercents],
    });

    stopElapsedTimer();
    elapsedTimerRef.current = setInterval(() => {
      const now = Date.now();
      setUploadProgress((prev) =>
        prev && prev.active ? { ...prev, elapsedMs: now - startTime } : prev
      );
    }, 100);

    for (let i = 0; i < filesToUpload.length; i++) {
      if (cancelRequestedRef.current) {
        for (let j = i; j < filesToUpload.length; j++) {
          fileStatuses[j] = "cancelled";
        }
        break;
      }

      const file = filesToUpload[i];
      const finalName = (fileRenames[`file_${i}`] || file.name).trim() || file.name;
      fileStatuses[i] = "uploading";

      setUploadProgress((prev) =>
        prev
          ? {
              ...prev,
              currentIndex: i,
              currentFileName: finalName,
              finalizing: false,
              fileStatuses: [...fileStatuses],
            }
          : prev
      );

      const result = await uploadSingleFile(file, finalName, (loadedInFile) => {
        const now = Date.now();
        const totalLoaded = completedBytes + loadedInFile;
        samples.push({ time: now, bytes: totalLoaded });

        // Keep a 2-second rolling window for responsive yet smooth speed readouts
        const windowCutoff = now - 2000;
        while (samples.length > 2 && samples[0].time < windowCutoff) {
          samples.shift();
        }
        const oldest = samples[0];
        const dtSeconds = (now - oldest.time) / 1000;
        const elapsedSeconds = Math.max(0.05, (now - startTime) / 1000);
        const speedBps =
          dtSeconds >= 0.25
            ? Math.max(0, (totalLoaded - oldest.bytes) / dtSeconds)
            : totalLoaded / elapsedSeconds;

        const filePercent =
          file.size > 0 ? Math.min(100, (loadedInFile / file.size) * 100) : 100;
        const finalizing = file.size > 0 && loadedInFile >= file.size;

        filePercents[i] = filePercent;
        fileStatuses[i] = finalizing ? "finalizing" : "uploading";

        setUploadProgress((prev) =>
          prev
            ? {
                ...prev,
                uploadedBytes: totalLoaded,
                elapsedMs: now - startTime,
                speedBps,
                finalizing,
                fileStatuses: [...fileStatuses],
                filePercents: [...filePercents],
              }
            : prev
        );
      });

      if (result.aborted) {
        for (let j = i; j < filesToUpload.length; j++) {
          fileStatuses[j] = "cancelled";
        }
        break;
      }

      if (result.ok) {
        completedBytes += file.size;
        succeededBytes += file.size;
        fileStatuses[i] = "done";
        filePercents[i] = 100;
        uploadedNames.push(finalName);
      } else {
        completedBytes += file.size;
        fileStatuses[i] = "error";
        errors.push(result.error || `Failed to upload ${finalName}`);
      }

      setUploadProgress((prev) =>
        prev
          ? {
              ...prev,
              uploadedBytes: completedBytes,
              finalizing: false,
              fileStatuses: [...fileStatuses],
              filePercents: [...filePercents],
            }
          : prev
      );
    }

    stopElapsedTimer();
    const totalElapsedMs = Math.max(1, Date.now() - startTime);
    const avgSpeedBps = succeededBytes / (totalElapsedMs / 1000);

    setUploadProgress((prev) =>
      prev
        ? {
            ...prev,
            active: false,
            finalizing: false,
            elapsedMs: totalElapsedMs,
            speedBps: avgSpeedBps,
            fileStatuses: [...fileStatuses],
            filePercents: [...filePercents],
          }
        : null
    );

    if (uploadedNames.length > 0) {
      revalidator.revalidate();
    }

    const timingSummary = `${formatBytes(succeededBytes)} in ${formatDuration(totalElapsedMs)} • avg ${formatBytes(avgSpeedBps)}/s`;

    if (cancelRequestedRef.current) {
      setUploadBanner({
        type: "info",
        message:
          uploadedNames.length > 0
            ? `Upload cancelled after ${formatDuration(totalElapsedMs)}. Uploaded ${uploadedNames.length} of ${filesToUpload.length} file(s): ${uploadedNames.join(", ")} (${timingSummary})`
            : `Upload cancelled after ${formatDuration(totalElapsedMs)}.`,
      });
    } else if (errors.length > 0 && uploadedNames.length === 0) {
      setUploadBanner({
        type: "error",
        message: errors.join("; "),
      });
    } else if (errors.length > 0) {
      setUploadBanner({
        type: "info",
        message: `Uploaded ${uploadedNames.length} file(s) (${timingSummary}). Errors: ${errors.join("; ")}`,
      });
    } else {
      resetUploadSelection();
      setShowUpload(false);
      setUploadProgress(null);
      setUploadBanner({
        type: "success",
        message: `Successfully uploaded ${uploadedNames.length} file(s): ${uploadedNames.join(", ")} (${timingSummary})`,
      });
    }
  };

  // Reset upload state after successful fallback form action
  useEffect(() => {
    if (actionData?.success) {
      resetUploadSelection();
      setShowUpload(false);
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

  const formatFileSize = formatBytes;
  const isUploading = uploadProgress?.active ?? false;
  const totalSelectedBytes = selectedFiles.reduce((sum, f) => sum + f.size, 0);
  const overallPercent = uploadProgress
    ? uploadProgress.totalBytes > 0
      ? Math.min(100, (uploadProgress.uploadedBytes / uploadProgress.totalBytes) * 100)
      : 100
    : 0;
  const remainingBytes = uploadProgress
    ? Math.max(0, uploadProgress.totalBytes - uploadProgress.uploadedBytes)
    : 0;
  const etaMs =
    uploadProgress &&
    uploadProgress.active &&
    !uploadProgress.finalizing &&
    uploadProgress.speedBps > 0 &&
    remainingBytes > 0
      ? (remainingBytes / uploadProgress.speedBps) * 1000
      : null;

  const statusBadgeStyles: Record<FileUploadStatus, string> = {
    queued: "bg-gray-100 text-gray-700",
    uploading: "bg-blue-100 text-blue-700",
    finalizing: "bg-amber-100 text-amber-800",
    done: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
    cancelled: "bg-gray-200 text-gray-600",
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
              disabled={isUploading}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
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

          {uploadBanner && (
            <div
              className={`mb-4 p-3 border rounded ${
                uploadBanner.type === "error"
                  ? "bg-red-100 border-red-400 text-red-700"
                  : uploadBanner.type === "success"
                    ? "bg-green-100 border-green-400 text-green-700"
                    : "bg-blue-50 border-blue-300 text-blue-800"
              }`}
            >
              {uploadBanner.message}
            </div>
          )}

          {showUpload && (
            <form
              method="post"
              encType="multipart/form-data"
              onSubmit={handleUploadSubmit}
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
                    disabled={isUploading}
                    onChange={handleFileChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-500 disabled:bg-gray-100 disabled:cursor-not-allowed file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="optimize"
                    checked={optimizeFiles}
                    disabled={isUploading}
                    onChange={(e) => setOptimizeFiles(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:cursor-not-allowed"
                  />
                  <label htmlFor="optimize" className="ml-2 block text-sm text-gray-700">
                    Optimize images before upload (compress and convert to WebP)
                  </label>
                </div>

                {uploadProgress && (
                  <div className="p-4 bg-white rounded-md border border-blue-200 shadow-xs space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium text-gray-900">
                        {uploadProgress.active
                          ? uploadProgress.finalizing
                            ? `Finalizing ${uploadProgress.currentFileName} (${uploadProgress.currentIndex + 1}/${uploadProgress.totalFiles})...`
                            : `Uploading ${uploadProgress.currentFileName} (${uploadProgress.currentIndex + 1}/${uploadProgress.totalFiles})`
                          : "Upload finished"}
                      </div>
                      <span className="text-sm font-semibold text-blue-700 tabular-nums">
                        {overallPercent.toFixed(1)}%
                      </span>
                    </div>

                    <div
                      className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(overallPercent)}
                    >
                      <div
                        className="h-full bg-blue-600 transition-all duration-150 ease-out"
                        style={{ width: `${overallPercent}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="bg-gray-50 rounded p-2">
                        <div className="text-gray-500">Uploaded</div>
                        <div className="font-semibold text-gray-900 tabular-nums">
                          {formatBytes(uploadProgress.uploadedBytes)} /{" "}
                          {formatBytes(uploadProgress.totalBytes)}
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded p-2">
                        <div className="text-gray-500">Elapsed</div>
                        <div className="font-semibold text-gray-900 tabular-nums">
                          {formatDuration(uploadProgress.elapsedMs)}
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded p-2">
                        <div className="text-gray-500">Speed</div>
                        <div className="font-semibold text-gray-900 tabular-nums">
                          {uploadProgress.speedBps > 0
                            ? `${formatBytes(uploadProgress.speedBps)}/s`
                            : "--"}
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded p-2">
                        <div className="text-gray-500">Remaining</div>
                        <div className="font-semibold text-gray-900 tabular-nums">
                          {uploadProgress.finalizing
                            ? "Finalizing..."
                            : etaMs !== null
                              ? `~${formatDuration(etaMs)}`
                              : "--"}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {selectedFiles.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between text-sm font-medium text-gray-700">
                      <h4>Selected Files ({selectedFiles.length}):</h4>
                      <span className="text-xs text-gray-500 tabular-nums">
                        Total: {formatBytes(totalSelectedBytes)}
                      </span>
                    </div>
                    {selectedFiles.map((file, index) => {
                      const fileKey = `file_${index}`;
                      const isEditing = editingFiles[fileKey];
                      const currentName = fileRenames[fileKey] || file.name;
                      const isImage = file.type?.startsWith("image/");
                      const fileStatus = uploadProgress?.fileStatuses[index];
                      const filePercent = uploadProgress?.filePercents[index] ?? 0;

                      return (
                        <div key={fileKey} className="p-3 bg-white rounded-md border space-y-2">
                          <div className="flex items-center space-x-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="text-sm text-gray-600">File:</span>
                                {isEditing && !isUploading ? (
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
                                  <div className="flex items-center space-x-2 flex-1 min-w-0">
                                    <span className="text-sm font-medium text-gray-800 truncate">{currentName}</span>
                                    {!isUploading && (
                                      <button
                                        type="button"
                                        onClick={() => toggleEdit(fileKey)}
                                        className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800 flex items-center"
                                      >
                                        <FontAwesomeIcon icon={faEdit} className="w-3 h-3" />
                                      </button>
                                    )}
                                    {fileStatus && (
                                      <span
                                        className={`px-2 py-0.5 text-xs font-medium rounded-full tabular-nums ${statusBadgeStyles[fileStatus]}`}
                                      >
                                        {fileStatus === "uploading"
                                          ? `${filePercent.toFixed(0)}%`
                                          : fileStatus === "finalizing"
                                            ? "Saving..."
                                            : fileStatus === "done"
                                              ? "Uploaded"
                                              : fileStatus === "error"
                                                ? "Failed"
                                                : fileStatus === "cancelled"
                                                  ? "Cancelled"
                                                  : "Queued"}
                                      </span>
                                    )}
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
                                  Size: {formatBytes(file.size)}
                                  {optimizeFiles && isImage && (
                                    <span className="text-green-600">
                                      {" "}
                                      → ~{formatBytes(file.size * 0.7)} (optimized)
                                    </span>
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
                              disabled={isUploading}
                              onClick={() => removeFile(index)}
                              className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center"
                            >
                              <FontAwesomeIcon icon={faMinus} className="mr-1 w-3 h-3" />
                              Remove
                            </button>
                          </div>
                          {fileStatus && (fileStatus === "uploading" || fileStatus === "finalizing" || fileStatus === "done") && (
                            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all duration-150 ${
                                  fileStatus === "done" ? "bg-green-500" : "bg-blue-500"
                                }`}
                                style={{ width: `${filePercent}%` }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={selectedFiles.length === 0 || isUploading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    <FontAwesomeIcon icon={faUpload} className="mr-2 w-4 h-4" />
                    {isUploading
                      ? `Uploading (${overallPercent.toFixed(0)}%)...`
                      : `Upload ${selectedFiles.length > 0 ? `${selectedFiles.length} File${selectedFiles.length > 1 ? "s" : ""}` : "Files"}`}
                  </button>
                  {isUploading && (
                    <button
                      type="button"
                      onClick={handleCancelUpload}
                      className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 flex items-center justify-center"
                    >
                      <FontAwesomeIcon icon={faTimes} className="mr-2 w-4 h-4" />
                      Cancel Upload
                    </button>
                  )}
                </div>
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
