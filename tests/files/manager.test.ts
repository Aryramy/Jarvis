import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserController } from '../../src/browser/index.js';
import { FileManager, createFileTools } from '../../src/files/index.js';
import { ToolRegistry } from '../../src/tools/index.js';

describe('File Downloads & Uploads Management (TASK-801)', () => {
  let controller: BrowserController;
  let fileManager: FileManager;
  let registry: ToolRegistry;
  let tempTestDir: string;
  let sampleUploadFile: string;

  const testFileHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Downloads & Uploads Sandbox</title>
      </head>
      <body>
        <h1>Files Playground</h1>

        <!-- Download trigger -->
        <a id="download-sample"
           href="data:text/plain;charset=utf-8,JARVIS%20Autonomous%20Artifact%20Content"
           download="jarvis_sample.txt">
          Download Sample
        </a>

        <!-- Upload target -->
        <div style="margin-top: 20px;">
          <label for="doc-upload">Upload Verification Document</label>
          <input type="file" id="doc-upload" name="verification_doc" />
        </div>
      </body>
    </html>
  `;

  const fixtureUrl = `data:text/html;charset=utf-8,${encodeURIComponent(testFileHtml)}`;

  beforeAll(async () => {
    tempTestDir = path.resolve(process.cwd(), 'downloads', 'test_sandbox');
    fs.mkdirSync(tempTestDir, { recursive: true });

    sampleUploadFile = path.join(tempTestDir, 'upload_payload.txt');
    fs.writeFileSync(sampleUploadFile, 'CONFIDENTIAL_TEST_PAYLOAD_DATA', 'utf-8');

    controller = new BrowserController();
    await controller.initialize({ headless: true });
    fileManager = new FileManager(controller, tempTestDir);
    registry = new ToolRegistry();
    const tools = createFileTools(fileManager);
    for (const tool of tools) {
      registry.register(tool);
    }
    await controller.openUrl(fixtureUrl);
  });

  afterAll(async () => {
    if (controller) {
      await controller.close();
    }
    // Cleanup test artifacts
    if (fs.existsSync(tempTestDir)) {
      try {
        fs.rmSync(tempTestDir, { recursive: true, force: true });
      } catch {
        // Ignore file lock during teardown
      }
    }
  });

  describe('Local File Disk Verification', () => {
    it('should verify an existing file on disk and compute size & sha256 checksum', async () => {
      const metadata = await fileManager.verifyFileOnDisk(sampleUploadFile);

      expect(metadata.exists).toBe(true);
      expect(metadata.filename).toBe('upload_payload.txt');
      expect(metadata.sizeBytes).toBeGreaterThan(0);
      expect(metadata.sha256).toBeDefined();
      expect(metadata.sha256?.length).toBe(64); // SHA-256 hex string length
    });

    it('should accurately report non-existent files', async () => {
      const nonExistentPath = path.join(tempTestDir, 'does_not_exist_404.txt');
      const metadata = await fileManager.verifyFileOnDisk(nonExistentPath);

      expect(metadata.exists).toBe(false);
      expect(metadata.sizeBytes).toBe(0);
    });
  });

  describe('Browser Download Interception & Verification', () => {
    it('should capture triggered download, save to disk, and verify byte size > 0', async () => {
      const downloadResult = await fileManager.downloadByTrigger('#download-sample', {
        customFilename: 'custom_report.txt',
      });

      expect(downloadResult.verified).toBe(true);
      expect(downloadResult.filename).toBe('custom_report.txt');
      expect(downloadResult.sizeBytes).toBeGreaterThan(0);
      expect(fs.existsSync(downloadResult.localPath)).toBe(true);

      const content = fs.readFileSync(downloadResult.localPath, 'utf-8');
      expect(content).toBe('JARVIS Autonomous Artifact Content');
    });
  });

  describe('Browser File Input Upload & DOM Verification', () => {
    it('should upload a local file into a web form file input and verify DOM attachment', async () => {
      const uploadResult = await fileManager.uploadFile(
        'Upload Verification Document',
        sampleUploadFile
      );

      expect(uploadResult.verified).toBe(true);
      expect(uploadResult.uploadedFilesCount).toBe(1);
      expect(uploadResult.filename).toBe('upload_payload.txt');
      expect(uploadResult.evidence.assignedFiles.length).toBe(1);
      expect(uploadResult.evidence.assignedFiles[0].name).toBe('upload_payload.txt');

      // Verify DOM input has the file
      const page = controller.getActivePage();
      const filesInDom = await page.locator('#doc-upload').evaluate((el) => {
        const input = el as HTMLInputElement;
        return input.files ? Array.from(input.files).map((f) => f.name) : [];
      });

      expect(filesInDom).toContain('upload_payload.txt');
    });

    it('should throw error when attempting to upload a non-existent file', async () => {
      await expect(
        fileManager.uploadFile('Upload Verification Document', 'non_existent_file.pdf')
      ).rejects.toThrow('does not exist');
    });
  });

  describe('Registered Tool Execution Envelope', () => {
    it('should execute file.verify via ToolRegistry with R0 riskLevel and checksum evidence', async () => {
      const verifyTool = registry.get('file.verify');
      expect(verifyTool).toBeDefined();

      const result = await verifyTool!.execute({
        filePath: sampleUploadFile,
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('file.verify');
      expect(result.riskLevel).toBe('R0');
      expect(result.evidence?.exists).toBe(true);
      expect(result.evidence?.sizeBytes).toBeGreaterThan(0);
    });

    it('should execute file.upload via ToolRegistry with R1 riskLevel', async () => {
      const uploadTool = registry.get('file.upload');
      expect(uploadTool).toBeDefined();

      const result = await uploadTool!.execute({
        targetInput: '#doc-upload',
        filePath: sampleUploadFile,
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('file.upload');
      expect(result.riskLevel).toBe('R1');
      expect(result.evidence?.assignedFiles.length).toBe(1);
    });

    it('should execute file.download via ToolRegistry with R1 riskLevel and disk evidence', async () => {
      const downloadTool = registry.get('file.download');
      expect(downloadTool).toBeDefined();

      const result = await downloadTool!.execute({
        triggerTarget: '#download-sample',
        customFilename: 'tool_download.txt',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('file.download');
      expect(result.riskLevel).toBe('R1');
      expect(result.evidence?.existsOnDisk).toBe(true);
      expect(result.evidence?.sizeBytes).toBeGreaterThan(0);
    });
  });
});
