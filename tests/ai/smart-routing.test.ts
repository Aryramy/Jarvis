import { describe, it, expect } from 'vitest';
import { classifyTask, getAdaptiveOutputBudget } from '../../task-classifier.mjs';
import { selectModel } from '../../model-router.mjs';
import { routeRequest, isMemoryQuestion, estimateMessagesTokens } from '../../route-request.mjs';
import { loadConversation, saveConversation, clearConversation } from '../../conversation-store.mjs';

describe('Phase 12.5: Hosted Cheaper Inference Smart Routing & Memory', () => {
  describe('1. Task Classification & Adaptive Output Budgets', () => {
    it('should classify normal conversational queries', () => {
      const res = classifyTask('Hello, how can you help me?');
      expect(res.type).toBe('normal');
      expect(res.coding).toBe(false);
      expect(res.reasoning).toBe(false);
      expect(res.outputBudget).toBe(2000);
    });

    it('should classify reasoning and logic queries', () => {
      const res = classifyTask('Explain the logic and analyze the tradeoffs step by step');
      expect(res.type).toBe('reasoning');
      expect(res.reasoning).toBe(true);
      expect(res.outputBudget).toBe(3000);
    });

    it('should classify coding tasks and imply reasoning capability', () => {
      const res = classifyTask('Debug this TypeScript API and fix the compile error in function');
      expect(res.type).toBe('coding');
      expect(res.coding).toBe(true);
      expect(res.reasoning).toBe(true);
      expect(res.outputBudget).toBe(5000);
    });

    it('should classify vision tasks when an image is present', () => {
      const res = classifyTask('What is inside this screenshot?', true);
      expect(res.type).toBe('vision');
      expect(res.vision).toBe(true);
      expect(res.outputBudget).toBe(2500);
    });
  });

  describe('2. Model Routing & Capability Filtering', () => {
    it('should route normal queries to an eligible chat model with fallback alternatives', async () => {
      const route = await selectModel({ vision: false, reasoning: false });
      expect(route.model).toBeDefined();
      expect(route.provider).toBeDefined();
      expect(route.estimatedCost).toBeGreaterThan(0);
      expect(route.alternatives.length).toBeGreaterThanOrEqual(1);
    });

    it('should enforce reasoning capability when reasoning is requested', async () => {
      const route = await selectModel({ vision: false, reasoning: true });
      expect(route.capabilities.reasoning).toBe(true);
    });

    it('should enforce vision capability when vision is requested', async () => {
      const route = await selectModel({ vision: true, reasoning: false });
      expect(route.capabilities.vision).toBe(true);
    });
  });

  describe('3. Context-Aware Token & Cost Estimation', () => {
    it('should estimate tokens from the exact context window and increase across multi-turn', async () => {
      const turn1 = await routeRequest({ text: 'What is Power BI?' });
      const turn2 = await routeRequest({
        text: 'Explain it more simply.',
        contextMessages: [
          { role: 'user', content: 'What is Power BI?' },
          { role: 'assistant', content: 'Power BI is an interactive data visualization software product.' },
        ],
      });

      expect(turn2.estimates.contextInputTokens).toBeGreaterThan(turn1.estimates.contextInputTokens);
      expect(turn2.estimates.estimatedMaxCostUSD).toBeGreaterThanOrEqual(turn1.estimates.estimatedMaxCostUSD);
    });
  });

  describe('4. Persistent Memory & Anti-Hallucination Directives', () => {
    it('should detect memory questions and protect against memory hallucination', () => {
      expect(isMemoryQuestion('What were we discussing before I restarted you?')).toBe(true);
      expect(isMemoryQuestion('What did we talk about earlier?')).toBe(true);
      expect(isMemoryQuestion('What is the weather today?')).toBe(false);
    });

    it('should atomically save and restore conversation messages without loss', async () => {
      await clearConversation();

      const sample = [
        { role: 'user', content: 'Discussion topic: Power BI' },
        { role: 'assistant', content: 'Confirmed topic is Power BI.' },
      ];

      await saveConversation(sample);
      const reloaded = await loadConversation();

      expect(reloaded.length).toBe(2);
      expect(reloaded[0].content).toBe('Discussion topic: Power BI');

      // Cleanup
      await clearConversation();
    });
  });
});
