import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, 'data');
const CONVERSATION_FILE = path.join(DATA_DIR, 'conversation.json');

export async function ensureDataDir() {
  if (!fsSync.existsSync(DATA_DIR)) {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

export async function loadConversation() {
  await ensureDataDir();
  try {
    if (!fsSync.existsSync(CONVERSATION_FILE)) {
      return [];
    }
    const raw = await fs.readFile(CONVERSATION_FILE, 'utf-8');
    if (!raw || raw.trim().length === 0) {
      return [];
    }
    const data = JSON.parse(raw);
    const messages = Array.isArray(data) ? data : Array.isArray(data?.messages) ? data.messages : [];

    // Filter out old persisted system messages so the CURRENT source prompt always governs
    return messages.filter((m) => m && (m.role === 'user' || m.role === 'assistant'));
  } catch (err) {
    console.warn(`[ConversationStore] Error loading history: ${err.message}. Starting fresh.`);
    return [];
  }
}

/**
 * Atomically writes conversation history to disk.
 * Uses temporary file + atomic rename to prevent corruption.
 */
export async function saveConversation(messages = []) {
  await ensureDataDir();

  // Scrub and persist only user and assistant messages (never system prompt or secrets)
  const cleanMessages = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      timestamp: m.timestamp || Date.now(),
    }));

  const payload = JSON.stringify({ messages: cleanMessages, updatedAt: Date.now() }, null, 2);
  const tempFile = path.join(DATA_DIR, `conversation.${Date.now()}.${Math.random().toString(36).substring(2, 7)}.tmp`);

  await fs.writeFile(tempFile, payload, 'utf-8');

  try {
    await fs.rename(tempFile, CONVERSATION_FILE);
  } catch {
    // Windows file-lock fallback: copy & unlink
    await fs.copyFile(tempFile, CONVERSATION_FILE);
    await fs.unlink(tempFile).catch(() => {});
  }
}

export async function clearConversation() {
  await ensureDataDir();
  if (fsSync.existsSync(CONVERSATION_FILE)) {
    try {
      await fs.unlink(CONVERSATION_FILE);
    } catch {
      await fs.writeFile(CONVERSATION_FILE, JSON.stringify({ messages: [] }), 'utf-8');
    }
  }
}

export function getConversationFilePath() {
  return CONVERSATION_FILE;
}
