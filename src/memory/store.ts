import fs from 'node:fs';
import path from 'node:path';
import {
  type UserProfile,
  type DomainPreference,
  type SessionState,
  type TaskRecord,
  type MemoryQueryFilter,
  userProfileSchema,
  domainPreferenceSchema,
  sessionStateSchema,
  taskRecordSchema,
} from './types.js';
import { sanitizeData } from './sanitizer.js';

export interface SessionStoreOptions {
  storageDir?: string;
  autoInit?: boolean;
}

export class SessionStore {
  readonly storageDir: string;
  private isInitialized = false;

  private profileCache: UserProfile | null = null;
  private domainsCache: Map<string, DomainPreference> = new Map();
  private sessionCache: SessionState | null = null;
  private tasksCache: TaskRecord[] | null = null;

  constructor(options?: SessionStoreOptions) {
    this.storageDir = options?.storageDir
      ? path.resolve(options.storageDir)
      : path.resolve(process.cwd(), '.jarvis', 'memory');

    if (options?.autoInit !== false) {
      this.ensureDirSync();
    }
  }

  private ensureDirSync(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    this.isInitialized = true;
  }

  async init(): Promise<void> {
    if (!this.isInitialized) {
      await fs.promises.mkdir(this.storageDir, { recursive: true });
      this.isInitialized = true;
    }
  }

  private getFilePath(filename: string): string {
    return path.join(this.storageDir, filename);
  }

  /**
   * Atomically writes data to disk by writing to a temporary file first,
   * then renaming it into place.
   */
  private async atomicWriteJson<T>(filename: string, data: T): Promise<void> {
    await this.init();
    const sanitized = sanitizeData(data);
    const content = JSON.stringify(sanitized, null, 2);
    const targetPath = this.getFilePath(filename);
    const tempPath = `${targetPath}.${Date.now()}.${Math.random().toString(36).substring(2, 8)}.tmp`;

    await fs.promises.writeFile(tempPath, content, 'utf-8');
    try {
      await fs.promises.rename(tempPath, targetPath);
    } catch {
      // Fallback for Windows file locks: copy & unlink
      await fs.promises.copyFile(tempPath, targetPath);
      await fs.promises.unlink(tempPath).catch(() => {});
    }
  }

  /**
   * Safely reads and parses a JSON file from storage.
   */
  private async readJson<T>(filename: string): Promise<T | null> {
    const filePath = this.getFilePath(filename);
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const raw = await fs.promises.readFile(filePath, 'utf-8');
      if (!raw || raw.trim().length === 0) {
        return null;
      }
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  // =========================================================================
  // User Profile
  // =========================================================================

  private getDefaultProfile(): UserProfile {
    return {
      userId: 'default_user',
      displayName: 'Operator',
      preferredLanguage: 'en',
      outputVerbosity: 'balanced',
      customPreferences: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  async getProfile(): Promise<UserProfile> {
    if (this.profileCache) {
      return this.profileCache;
    }

    const saved = await this.readJson<unknown>('profile.json');
    if (saved) {
      const parsed = userProfileSchema.safeParse(saved);
      if (parsed.success) {
        this.profileCache = parsed.data;
        return this.profileCache;
      }
    }

    const defaultProfile = this.getDefaultProfile();
    this.profileCache = defaultProfile;
    await this.saveProfile(defaultProfile);
    return defaultProfile;
  }

  async saveProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
    const current = await this.getProfile();
    const merged = {
      ...current,
      ...updates,
      updatedAt: Date.now(),
    };

    const sanitized = sanitizeData(merged);
    const validated = userProfileSchema.parse(sanitized);
    this.profileCache = validated;
    await this.atomicWriteJson('profile.json', validated);
    return validated;
  }

  // =========================================================================
  // Domain Preferences
  // =========================================================================

  private async loadDomains(): Promise<Map<string, DomainPreference>> {
    if (this.domainsCache.size > 0) {
      return this.domainsCache;
    }

    const saved = await this.readJson<Record<string, unknown>>('domains.json');
    this.domainsCache.clear();

    if (saved && typeof saved === 'object') {
      for (const [domain, pref] of Object.entries(saved)) {
        const parsed = domainPreferenceSchema.safeParse(pref);
        if (parsed.success) {
          this.domainsCache.set(domain.toLowerCase(), parsed.data);
        }
      }
    }

    return this.domainsCache;
  }

  async getDomain(domain: string): Promise<DomainPreference | null> {
    const normalized = domain.toLowerCase().trim();
    const map = await this.loadDomains();
    return map.get(normalized) ?? null;
  }

  async setDomain(domain: string, preference: Partial<DomainPreference>): Promise<DomainPreference> {
    const normalized = domain.toLowerCase().trim();
    const map = await this.loadDomains();
    const existing = map.get(normalized);

    const merged = {
      domain: normalized,
      ...existing,
      ...preference,
      visitCount: (existing?.visitCount ?? 0) + (preference.visitCount ?? 1),
      lastVisitedAt: Date.now(),
      updatedAt: Date.now(),
    };

    const sanitized = sanitizeData(merged);
    const validated = domainPreferenceSchema.parse(sanitized);
    map.set(normalized, validated);

    const serialized: Record<string, DomainPreference> = {};
    for (const [key, val] of map.entries()) {
      serialized[key] = val;
    }

    await this.atomicWriteJson('domains.json', serialized);
    return validated;
  }

  async listDomains(): Promise<DomainPreference[]> {
    const map = await this.loadDomains();
    return Array.from(map.values());
  }

  // =========================================================================
  // Session State
  // =========================================================================

  async getSession(): Promise<SessionState | null> {
    if (this.sessionCache) {
      return this.sessionCache;
    }

    const saved = await this.readJson<unknown>('session.json');
    if (saved) {
      const parsed = sessionStateSchema.safeParse(saved);
      if (parsed.success) {
        this.sessionCache = parsed.data;
        return this.sessionCache;
      }
    }
    return null;
  }

  async saveSession(state: Partial<SessionState>): Promise<SessionState> {
    const current = (await this.getSession()) ?? {
      sessionId: `session_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      status: 'ACTIVE',
      metadata: {},
    };

    const merged = {
      ...current,
      ...state,
      updatedAt: Date.now(),
    };

    const sanitized = sanitizeData(merged);
    const validated = sessionStateSchema.parse(sanitized);
    this.sessionCache = validated;
    await this.atomicWriteJson('session.json', validated);
    return validated;
  }

  async clearSession(): Promise<void> {
    this.sessionCache = null;
    const filePath = this.getFilePath('session.json');
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath).catch(() => {});
    }
  }

  // =========================================================================
  // Task History
  // =========================================================================

  private async loadTasks(): Promise<TaskRecord[]> {
    if (this.tasksCache) {
      return this.tasksCache;
    }

    const saved = await this.readJson<unknown[]>('tasks.json');
    if (Array.isArray(saved)) {
      const validTasks: TaskRecord[] = [];
      for (const item of saved) {
        const parsed = taskRecordSchema.safeParse(item);
        if (parsed.success) {
          validTasks.push(parsed.data);
        }
      }
      this.tasksCache = validTasks;
      return this.tasksCache;
    }

    this.tasksCache = [];
    return this.tasksCache;
  }

  async addTaskRecord(task: TaskRecord): Promise<TaskRecord> {
    const sanitized = sanitizeData(task);
    const validated = taskRecordSchema.parse(sanitized);
    const tasks = await this.loadTasks();

    // Check if task exists; update or prepend
    const existingIndex = tasks.findIndex((t) => t.taskId === validated.taskId);
    if (existingIndex >= 0) {
      tasks[existingIndex] = validated;
    } else {
      tasks.unshift(validated); // Most recent first
    }

    // Keep history bounded to 200 most recent records
    if (tasks.length > 200) {
      tasks.splice(200);
    }

    this.tasksCache = tasks;
    await this.atomicWriteJson('tasks.json', tasks);
    return validated;
  }

  async queryTasks(filter?: MemoryQueryFilter): Promise<TaskRecord[]> {
    let tasks = await this.loadTasks();

    if (!filter) {
      return [...tasks];
    }

    if (filter.status) {
      tasks = tasks.filter((t) => t.status === filter.status);
    }

    if (filter.intent) {
      tasks = tasks.filter((t) => t.intent.toLowerCase() === filter.intent?.toLowerCase());
    }

    if (filter.fromDate) {
      tasks = tasks.filter((t) => t.startedAt >= filter.fromDate!);
    }

    if (filter.toDate) {
      tasks = tasks.filter((t) => t.startedAt <= filter.toDate!);
    }

    if (filter.query) {
      const q = filter.query.toLowerCase();
      tasks = tasks.filter(
        (t) =>
          t.instruction.toLowerCase().includes(q) ||
          t.summary.toLowerCase().includes(q) ||
          (t.tags && t.tags.some((tag) => tag.toLowerCase().includes(q)))
      );
    }

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? tasks.length;
    return tasks.slice(offset, offset + limit);
  }

  async clearTasks(): Promise<void> {
    this.tasksCache = [];
    const filePath = this.getFilePath('tasks.json');
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath).catch(() => {});
    }
  }

  // =========================================================================
  // Maintenance & Diagnostics
  // =========================================================================

  async clearAll(): Promise<void> {
    this.profileCache = null;
    this.domainsCache.clear();
    this.sessionCache = null;
    this.tasksCache = null;

    const files = ['profile.json', 'domains.json', 'session.json', 'tasks.json'];
    for (const f of files) {
      const p = this.getFilePath(f);
      if (fs.existsSync(p)) {
        await fs.promises.unlink(p).catch(() => {});
      }
    }
  }

  async exportAll(): Promise<{
    profile: UserProfile;
    domains: DomainPreference[];
    session: SessionState | null;
    tasks: TaskRecord[];
  }> {
    return {
      profile: await this.getProfile(),
      domains: await this.listDomains(),
      session: await this.getSession(),
      tasks: await this.queryTasks(),
    };
  }
}
