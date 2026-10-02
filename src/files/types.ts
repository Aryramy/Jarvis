export interface FileMetadata {
  filename: string;
  localPath: string;
  sizeBytes: number;
  mimeType?: string;
  extension: string;
  exists: boolean;
  sha256?: string;
  lastModified: string;
}

export interface DownloadOptions {
  timeoutMs?: number;
  customFilename?: string;
  downloadsDir?: string;
}

export interface DownloadResult {
  filename: string;
  localPath: string;
  sizeBytes: number;
  url?: string;
  verified: boolean;
  evidence: {
    existsOnDisk: boolean;
    sizeBytes: number;
    durationMs: number;
    sha256?: string;
    downloadedAt: string;
  };
}

export interface UploadOptions {
  timeoutMs?: number;
}

export interface UploadResult {
  fieldTarget: string;
  localPath: string;
  filename: string;
  sizeBytes: number;
  uploadedFilesCount: number;
  verified: boolean;
  evidence: {
    matchedInputSelector: string;
    assignedFiles: Array<{ name: string; size: number }>;
    verifiedAt: string;
  };
}
