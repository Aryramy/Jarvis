import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  SessionStore,
  MemoryAgent,
  sanitizeData,
  sanitizeString,
  containsCredentials,
  type UserProfile,
  type TaskRecord,
} from '../../src/memory/index.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { SupervisorAgent } from '../../src/supervisor/agent.js';

const TEST_MEMORY_DIR = path.resolve(process.cwd(), 'temp', 'test_memory_' + Date.now());

function cleanupTestDir() {
  if (fs.existsSync(TEST_MEMORY_DIR)) {
    fs.rmSync(TEST_MEMORY_DIR, { recursive: true, force: true });
  }
}

describe('Phase 11: Cross-Session Persistent Memory & Credential Boundary', () => {
  beforeEach(() => {
    cleanupTestDir();
  });

  afterEach(() => {
    cleanupTestDir();
  });

  describe('1. Credential Scrubber & Boundary Isolation (NFR-004)', () => {
    it('should detect sensitive credentials accurately', () => {
      expect(containsCredentials({ password: 'mypassword123' })).toBe(true);
      expect(containsCredentials({ apiKey: 'sk-1234567890abcdef' })).toBe(true);
      expect(containsCredentials({ user: 'ahmed', notes: 'normal notes' })).toBe(false);
      expect(containsCredentials('Bearer abcdef1234567890')).toBe(true);
      expect(containsCredentials('4111 2222 3333 4444')).toBe(true);
    });

    it('should redact sensitive object keys and nested credentials', () => {
      const sensitiveInput = {
        username: 'operator',
        password: 'SuperSecretPassword!',
        auth: {
          apiKey: 'key_123456789',
          sessionToken: 'token_abcdef',
          otp: '123456',
          cvv: '999',
        },
        preferences: {
          theme: 'dark',
          language: 'ur',
        },
      };

      const sanitized = sanitizeData(sensitiveInput);

      expect(sanitized.username).toBe('operator');
      expect(sanitized.password).toBe('[REDACTED_CREDENTIAL]');
      expect(sanitized.auth.apiKey).toBe('[REDACTED_CREDENTIAL]');
      expect(sanitized.auth.sessionToken).toBe('[REDACTED_CREDENTIAL]');
      expect(sanitized.auth.otp).toBe('[REDACTED_CREDENTIAL]');
      expect(sanitized.auth.cvv).toBe('[REDACTED_CREDENTIAL]');
      expect(sanitized.preferences.theme).toBe('dark');
      expect(sanitized.preferences.language).toBe('ur');
    });

    it('should scrub inline tokens, credit cards, and private keys from strings', () => {
      const authHeader = 'Authorization: Bearer secret_token_value_12345';
      expect(sanitizeString(authHeader)).toBe('Authorization: Bearer [REDACTED_TOKEN]');

      const cardString = 'Payment using card 4111 2222 3333 4444 confirmed.';
      expect(sanitizeString(cardString)).toContain('[REDACTED_CARD_NUMBER]');

      const pemKey = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----';
      expect(sanitizeString(pemKey)).toBe('[REDACTED_PRIVATE_KEY]');

      const basicUrl = 'https://admin:superSecretPass@api.example.com/data';
      expect(sanitizeString(basicUrl)).toBe('https://admin:[REDACTED_PASSWORD]@api.example.com/data');
    });

    it('should preserve benign strings and technical URLs without false positives', () => {
      const normal = 'Search query for latest quantum computing papers';
      expect(sanitizeString(normal)).toBe(normal);

      const url = 'https://news.ycombinator.com/item?id=123456';
      expect(sanitizeString(url)).toBe(url);
    });
  });

  describe('2. SessionStore File-Backed Atomic Persistence & Recovery', () => {
    it('should persist user profile across simulated restarts', async () => {
      const store1 = new SessionStore({ storageDir: TEST_MEMORY_DIR });
      await store1.init();

      const profile: Partial<UserProfile> = {
        userId: 'user_42',
        displayName: 'Jarvis Lead',
        preferredLanguage: 'ur',
        outputVerbosity: 'concise',
        customPreferences: { highContrast: true },
      };

      await store1.saveProfile(profile);

      // Simulate complete process restart with new SessionStore instance
      const store2 = new SessionStore({ storageDir: TEST_MEMORY_DIR });
      const loaded = await store2.getProfile();

      expect(loaded.userId).toBe('user_42');
      expect(loaded.displayName).toBe('Jarvis Lead');
      expect(loaded.preferredLanguage).toBe('ur');
      expect(loaded.outputVerbosity).toBe('concise');
      expect(loaded.customPreferences.highContrast).toBe(true);
    });

    it('should strictly scrub credentials before writing to disk file', async () => {
      const store = new SessionStore({ storageDir: TEST_MEMORY_DIR });
      await store.init();

      await store.saveProfile({
        userId: 'user_secure',
        customPreferences: {
          secretApiKey: 'sk-9876543210abcdef',
          password: 'plain_text_password',
          notes: 'Bearer sensitive_auth_token_value',
        },
      });

      // Directly read the raw JSON file from disk to verify zero plaintext leakage
      const rawDiskContent = fs.readFileSync(path.join(TEST_MEMORY_DIR, 'profile.json'), 'utf-8');
      expect(rawDiskContent).not.toContain('sk-9876543210abcdef');
      expect(rawDiskContent).not.toContain('plain_text_password');
      expect(rawDiskContent).not.toContain('sensitive_auth_token_value');
      expect(rawDiskContent).toContain('[REDACTED_CREDENTIAL]');
      expect(rawDiskContent).toContain('[REDACTED_TOKEN]');
    });

    it('should manage domain navigation preferences and visit metrics', async () => {
      const store = new SessionStore({ storageDir: TEST_MEMORY_DIR });
      await store.init();

      await store.setDomain('github.com', {
        autoFillAllowed: true,
        notes: 'Developer repository host',
        customRules: ['prefer-dark-mode'],
      });

      // Second visit
      await store.setDomain('github.com', { notes: 'Updated notes' });

      const domainPref = await store.getDomain('github.com');
      expect(domainPref).not.toBeNull();
      expect(domainPref?.domain).toBe('github.com');
      expect(domainPref?.autoFillAllowed).toBe(true);
      expect(domainPref?.notes).toBe('Updated notes');
      expect(domainPref?.visitCount).toBeGreaterThanOrEqual(2);
    });

    it('should track active session state and support clearing session', async () => {
      const store = new SessionStore({ storageDir: TEST_MEMORY_DIR });
      await store.init();

      await store.saveSession({
        sessionId: 'session_alpha',
        status: 'ACTIVE',
        activeUrl: 'https://example.com',
        currentGoal: 'Download test report',
      });

      let session = await store.getSession();
      expect(session).not.toBeNull();
      expect(session?.sessionId).toBe('session_alpha');
      expect(session?.currentGoal).toBe('Download test report');

      // Clear session
      await store.clearSession();
      session = await store.getSession();
      expect(session).toBeNull();
    });

    it('should record task history and support multifaceted querying', async () => {
      const store = new SessionStore({ storageDir: TEST_MEMORY_DIR });
      await store.init();

      const tasks: TaskRecord[] = [
        {
          taskId: 'task_001',
          instruction: 'Search for TypeScript documentation',
          intent: 'SEARCH',
          language: 'en',
          status: 'COMPLETED',
          stepsCount: 2,
          startedAt: Date.now() - 5000,
          completedAt: Date.now() - 4000,
          summary: 'Found official TS docs',
          tags: ['search', 'typescript'],
        },
        {
          taskId: 'task_002',
          instruction: 'Submit job application form',
          intent: 'FORM',
          language: 'ur',
          status: 'WAITING_FOR_AUTHORIZATION',
          stepsCount: 3,
          startedAt: Date.now() - 3000,
          summary: 'Awaiting user authorization to submit R2 form',
          tags: ['form', 'application'],
        },
        {
          taskId: 'task_003',
          instruction: 'Download quarterly earnings report',
          intent: 'DOWNLOAD',
          language: 'en',
          status: 'FAILED',
          stepsCount: 1,
          startedAt: Date.now() - 1000,
          summary: '404 not found',
          error: 'Remote file unreachable',
          tags: ['finance'],
        },
      ];

      for (const t of tasks) {
        await store.addTaskRecord(t);
      }

      // Query all tasks
      const all = await store.queryTasks();
      expect(all.length).toBe(3);

      // Query by status
      const authRequired = await store.queryTasks({ status: 'WAITING_FOR_AUTHORIZATION' });
      expect(authRequired.length).toBe(1);
      expect(authRequired[0].taskId).toBe('task_002');

      // Query by keyword search
      const financeTasks = await store.queryTasks({ query: 'earnings' });
      expect(financeTasks.length).toBe(1);
      expect(financeTasks[0].taskId).toBe('task_003');

      // Query with limit
      const top1 = await store.queryTasks({ limit: 1 });
      expect(top1.length).toBe(1);
    });
  });

  describe('3. Registered Memory Tools via ToolRegistry', () => {
    it('should register memory tools with appropriate risk levels', () => {
      const store = new SessionStore({ storageDir: TEST_MEMORY_DIR });
      const agent = new MemoryAgent({ store });
      const tools = agent.tools.listTools();

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('memory.get_profile');
      expect(toolNames).toContain('memory.update_profile');
      expect(toolNames).toContain('memory.get_domain_preference');
      expect(toolNames).toContain('memory.set_domain_preference');
      expect(toolNames).toContain('memory.query_tasks');
      expect(toolNames).toContain('memory.get_session_state');
      expect(toolNames).toContain('memory.save_session_state');
      expect(toolNames).toContain('memory.clear_session');

      // Verify risk levels
      const getProfile = tools.find((t) => t.name === 'memory.get_profile');
      expect(getProfile?.riskLevel).toBe('R0');

      const updateProfile = tools.find((t) => t.name === 'memory.update_profile');
      expect(updateProfile?.riskLevel).toBe('R1');
    });

    it('should execute memory.update_profile and return verified evidence', async () => {
      const store = new SessionStore({ storageDir: TEST_MEMORY_DIR });
      const agent = new MemoryAgent({ store });

      const result = await agent.act(
        'memory.update_profile',
        {
          preferredLanguage: 'ar',
          outputVerbosity: 'detailed',
          displayName: 'Commander',
        },
        {}
      );

      expect(result.success).toBe(true);
      expect(result.riskLevel).toBe('R1');
      expect(result.data.preferredLanguage).toBe('ar');
      expect(result.data.outputVerbosity).toBe('detailed');

      // Verify persistence via second get call
      const getResult = await agent.act('memory.get_profile', {}, {});
      expect(getResult.success).toBe(true);
      expect(getResult.data.preferredLanguage).toBe('ar');
    });
  });

  describe('4. MemoryAgent Natural Language Interface & Dual Channels', () => {
    it('should handle natural language language switch and return localized speech', async () => {
      const store = new SessionStore({ storageDir: TEST_MEMORY_DIR });
      const agent = new MemoryAgent({ store });

      const result = await agent.run('Change language to Urdu');
      expect(result.success).toBe(true);
      expect(result.speechResponse).toContain('Aap ki pasandeeda zaban Urdu');
      expect(result.displayResponse).toContain('`ur`');

      const profile = await agent.getProfile();
      expect(profile.preferredLanguage).toBe('ur');
    });

    it('should provide formatted markdown task history and spoken summary', async () => {
      const store = new SessionStore({ storageDir: TEST_MEMORY_DIR });
      const agent = new MemoryAgent({ store });

      await agent.recordTask({
        taskId: 'task_historical_1',
        instruction: 'Search for Mars Rover images',
        intent: 'SEARCH',
        language: 'en',
        status: 'COMPLETED',
        stepsCount: 2,
        startedAt: Date.now(),
        summary: 'Retrieved 10 images of Mars',
      });

      const result = await agent.run('Show recent task history');
      expect(result.success).toBe(true);
      expect(result.speechResponse).toContain('Found 1 recent task in memory');
      expect(result.displayResponse).toContain('| Task ID | Instruction | Status | Time |');
      expect(result.displayResponse).toContain('task_historical_1');
    });
  });

  describe('5. SupervisorAgent & MemoryAgent Cross-Agent Integration', () => {
    it('should automatically record executed tasks in memory store', async () => {
      const store = new SessionStore({ storageDir: TEST_MEMORY_DIR });
      const memoryAgent = new MemoryAgent({ store });

      const supervisor = new SupervisorAgent({
        memory: memoryAgent,
        useLLMPlan: false,
      });

      // Execute a conversational fast-path task
      const result = await supervisor.run('Hello JARVIS');
      expect(result.success).toBe(true);

      // Verify that the task was automatically persisted in memory
      const recordedTasks = await memoryAgent.queryTasks();
      expect(recordedTasks.length).toBe(1);
      expect(recordedTasks[0].instruction).toBe('Hello JARVIS');
      expect(recordedTasks[0].intent).toBe('CONVERSATIONAL');
      expect(recordedTasks[0].status).toBe('COMPLETED');
    });
  });
});
