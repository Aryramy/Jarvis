import fs from 'node:fs/promises';
import {
  loadConversation,
  saveConversation,
  clearConversation,
  getConversationFilePath,
} from './conversation-store.mjs';
import { isMemoryQuestion, getMemoryGroundingDirective } from './route-request.mjs';

async function runMemoryTests() {
  console.log('=== Persistent Memory Tests (Section 46, 47, 50, 52, 53) ===\n');

  // Backup existing conversation if present
  let originalRaw = null;
  const filePath = getConversationFilePath();
  try {
    originalRaw = await fs.readFile(filePath, 'utf-8');
  } catch {
    // No existing file
  }

  try {
    console.log('--- TEST 1: Independent Save and Reload ---');
    await clearConversation();

    const sampleHistory = [
      { role: 'user', content: 'My test topic is Power BI.' },
      { role: 'assistant', content: 'Understood.' },
      { role: 'user', content: 'Give me an HR example.' },
      { role: 'assistant', content: 'An HR dashboard can show headcount and turnover.' },
    ];

    await saveConversation(sampleHistory);

    // Completely reload from disk
    const reloaded = await loadConversation();
    console.log(`Saved ${sampleHistory.length} messages, reloaded ${reloaded.length} messages.`);
    if (reloaded.length !== sampleHistory.length) {
      throw new Error('Test 1 failed: Reloaded message count mismatch.');
    }
    if (reloaded[0].content !== 'My test topic is Power BI.' || reloaded[3].content !== 'An HR dashboard can show headcount and turnover.') {
      throw new Error('Test 1 failed: Reloaded content does not match original.');
    }
    console.log('Status: PASS\n');

    console.log('--- TEST 2: Startup Overwrite Protection (Section 47) ---');
    // Calling loadConversation simulating an app startup
    const startupLoaded = await loadConversation();
    if (startupLoaded.length !== 4) {
      throw new Error('Test 2 failed: History was modified on startup read.');
    }
    // Verify file content remains intact on disk
    const onDisk = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    if (!Array.isArray(onDisk.messages) || onDisk.messages.length !== 4) {
      throw new Error('Test 2 failed: Disk file was corrupted or wiped.');
    }
    console.log('Status: PASS\n');

    console.log('--- TEST 3: System Prompt Upgrade / Isolation (Section 53) ---');
    // Save history containing an obsolete system message
    const pollutedHistory = [
      { role: 'system', content: 'OBSOLETE SYSTEM PROMPT FROM AN OLD VERSION' },
      { role: 'user', content: 'What is Power BI?' },
      { role: 'assistant', content: 'Power BI is business intelligence.' },
    ];
    await saveConversation(pollutedHistory);
    const cleaned = await loadConversation();
    // System message must be stripped out so current source prompt takes over
    const hasSystemMessage = cleaned.some((m) => m.role === 'system');
    if (hasSystemMessage) {
      throw new Error('Test 3 failed: Persisted system message was not discarded.');
    }
    if (cleaned.length !== 2) {
      throw new Error('Test 3 failed: User/assistant messages were improperly altered.');
    }
    console.log('Status: PASS\n');

    console.log('--- TEST 4: /new vs /exit Semantics (Section 51 & 52) ---');
    // Clear conversation simulates /new
    await clearConversation();
    const afterNew = await loadConversation();
    if (afterNew.length !== 0) {
      throw new Error('Test 4 failed: /new did not clear conversation.');
    }

    // Save and re-check simulates /exit
    await saveConversation([{ role: 'user', content: 'Exit test topic' }]);
    const afterExit = await loadConversation();
    if (afterExit.length !== 1) {
      throw new Error('Test 4 failed: /exit did not preserve conversation.');
    }
    console.log('Status: PASS\n');

    console.log('--- TEST 5: Memory Question & Anti-Hallucination Directives ---');
    const q1 = 'What were we discussing before I restarted you?';
    const q2 = 'What did we talk about earlier?';
    const q3 = 'What is the speed of light?';

    if (!isMemoryQuestion(q1) || !isMemoryQuestion(q2) || isMemoryQuestion(q3)) {
      throw new Error('Test 5 failed: Memory question detector failed.');
    }

    const directive = getMemoryGroundingDirective();
    if (!directive.includes('prior conversation messages') || !directive.includes('Never invent or hallucinate')) {
      throw new Error('Test 5 failed: Grounding directive missing anti-hallucination instructions.');
    }
    console.log('Status: PASS\n');

    console.log('ALL PERSISTENT MEMORY TESTS PASSED.');
  } finally {
    // Restore original conversation state if it existed, otherwise clean up
    if (originalRaw != null) {
      await fs.writeFile(filePath, originalRaw, 'utf-8');
    } else {
      await clearConversation();
    }
  }
}

runMemoryTests().catch((e) => {
  console.error('Memory Test Failed:', e.message);
  process.exit(1);
});
