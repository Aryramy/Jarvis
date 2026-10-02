import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Page, Locator } from 'playwright';
import type { BrowserController } from '../browser/controller.js';
import type {
  DownloadOptions,
  DownloadResult,
  UploadOptions,
  UploadResult,
  FileMetadata,
} from './types.js';

export class FileManager {
  private defaultDownloadsDir: string;

  constructor(
    private browser: BrowserController,
    downloadsDir?: string
  ) {
    this.defaultDownloadsDir = downloadsDir
      ? path.resolve(downloadsDir)
      : path.resolve(process.cwd(), 'downloads');

    if (!fs.existsSync(this.defaultDownloadsDir)) {
      fs.mkdirSync(this.defaultDownloadsDir, { recursive: true });
    }
  }

  /**
   * Returns the active downloads directory path, creating it if needed.
   */
  getDownloadsDir(): string {
    if (!fs.existsSync(this.defaultDownloadsDir)) {
      fs.mkdirSync(this.defaultDownloadsDir, { recursive: true });
    }
    return this.defaultDownloadsDir;
  }

  /**
   * Verifies a file on disk, checking existence, byte size, and SHA256 integrity.
   */
  async verifyFileOnDisk(filePath: string): Promise<FileMetadata> {
    const resolvedPath = path.resolve(filePath);
    const exists = fs.existsSync(resolvedPath);

    if (!exists) {
      return {
        filename: path.basename(resolvedPath),
        localPath: resolvedPath,
        sizeBytes: 0,
        extension: path.extname(resolvedPath),
        exists: false,
        lastModified: new Date(0).toISOString(),
      };
    }

    const stat = fs.statSync(resolvedPath);
    const fileBuffer = fs.readFileSync(resolvedPath);
    const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    return {
      filename: path.basename(resolvedPath),
      localPath: resolvedPath,
      sizeBytes: stat.size,
      extension: path.extname(resolvedPath),
      exists: true,
      sha256,
      lastModified: stat.mtime.toISOString(),
    };
  }

  /**
   * Captures a download triggered by clicking an element or running an action.
   */
  async downloadByTrigger(
    trigger: string | (() => Promise<void>),
    options: DownloadOptions = {}
  ): Promise<DownloadResult> {
    const page = this.browser.getActivePage();
    const timeoutMs = options.timeoutMs ?? 30000;
    const destDir = options.downloadsDir ? path.resolve(options.downloadsDir) : this.getDownloadsDir();
    const startTime = Date.now();

    // Start listening for download event BEFORE triggering the action
    const downloadPromise = page.waitForEvent('download', { timeout: timeoutMs });

    if (typeof trigger === 'string') {
      await this.browser.click(trigger);
    } else {
      await trigger();
    }

    const download = await downloadPromise;
    const originalFilename = download.suggestedFilename();
    const finalFilename = options.customFilename ?? originalFilename;
    const targetPath = path.join(destDir, finalFilename);

    await download.saveAs(targetPath);

    const metadata = await this.verifyFileOnDisk(targetPath);
    const verified = metadata.exists && metadata.sizeBytes > 0;

    return {
      filename: finalFilename,
      localPath: targetPath,
      sizeBytes: metadata.sizeBytes,
      url: download.url(),
      verified,
      evidence: {
        existsOnDisk: metadata.exists,
        sizeBytes: metadata.sizeBytes,
        durationMs: Date.now() - startTime,
        sha256: metadata.sha256,
        downloadedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Resolves a file input locator on the page.
   */
  private async resolveFileInputLocator(page: Page, target: string): Promise<{ locator: Locator; matchedBy: string }> {
    // 1. By label
    const byLabel = page.getByLabel(target);
    if ((await byLabel.count()) > 0) {
      return { locator: byLabel.first(), matchedBy: 'label' };
    }

    // 2. Direct selector
    try {
      const bySelector = page.locator(target);
      if ((await bySelector.count()) > 0) {
        return { locator: bySelector.first(), matchedBy: 'selector' };
      }
    } catch {
      // not a selector
    }

    // 3. Fallback to generic file input
    const anyFileInput = page.locator('input[type="file"]');
    if ((await anyFileInput.count()) > 0) {
      return { locator: anyFileInput.first(), matchedBy: 'fallback:input[type="file"]' };
    }

    throw new Error(`[FileManager] Unable to find file input field matching "${target}".`);
  }

  /**
   * Uploads a verified local file into an interactive web form file input.
   */
  async uploadFile(
    targetInputOrLabel: string,
    localFilePath: string,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    const resolvedPath = path.resolve(localFilePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`[FileManager] Local file to upload does not exist: "${resolvedPath}".`);
    }

    const stat = fs.statSync(resolvedPath);
    if (stat.isDirectory()) {
      throw new Error(`[FileManager] Target path is a directory, not a file: "${resolvedPath}".`);
    }

    const page = this.browser.getActivePage();
    const timeoutMs = options.timeoutMs ?? 10000;

    const { locator, matchedBy } = await this.resolveFileInputLocator(page, targetInputOrLabel);
    await locator.waitFor({ state: 'attached', timeout: timeoutMs });

    // Set files on the input element
    await locator.setInputFiles(resolvedPath);

    // Verify files were attached in the DOM
    const assignedFiles = await locator.evaluate((el) => {
      const input = el as HTMLInputElement;
      if (!input.files || input.files.length === 0) return [];
      return Array.from(input.files).map((f) => ({
        name: f.name,
        size: f.size,
      }));
    });

    const verified = assignedFiles.length > 0;

    return {
      fieldTarget: targetInputOrLabel,
      localPath: resolvedPath,
      filename: path.basename(resolvedPath),
      sizeBytes: stat.size,
      uploadedFilesCount: assignedFiles.length,
      verified,
      evidence: {
        matchedInputSelector: matchedBy,
        assignedFiles,
        verifiedAt: new Date().toISOString(),
      },
    };
  }
}
