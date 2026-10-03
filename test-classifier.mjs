import { classifyTask } from './task-classifier.mjs';

function runClassifierTests() {
  console.log('=== Task Classifier Tests (Section 40) ===\n');

  // Test 1: Normal
  const res1 = classifyTask('Hello, how are you?');
  console.log('Test 1 ("Hello, how are you?"):', res1);
  if (res1.type !== 'normal' || res1.coding || res1.reasoning || res1.vision) {
    throw new Error('Test 1 failed: Expected normal task.');
  }

  // Test 2: Reasoning
  const res2 = classifyTask('Why does this happen? Explain the logic.');
  console.log('Test 2 ("Explain the logic"):', res2);
  if (res2.type !== 'reasoning' || !res2.reasoning || res2.coding) {
    throw new Error('Test 2 failed: Expected reasoning task.');
  }

  // Test 3: Coding (coding implies reasoning)
  const res3 = classifyTask('Debug this TypeScript API.');
  console.log('Test 3 ("Debug TypeScript API"):', res3);
  if (res3.type !== 'coding' || !res3.coding || !res3.reasoning) {
    throw new Error('Test 3 failed: Expected coding=true and reasoning=true.');
  }

  // Test 4: Vision
  const res4 = classifyTask('What is in this picture?', true);
  console.log('Test 4 (Vision with image):', res4);
  if (!res4.vision) {
    throw new Error('Test 4 failed: Expected vision=true.');
  }

  // Test 5: Adaptive Budgets
  if (res1.outputBudget !== 2000 || res2.outputBudget !== 3000 || res3.outputBudget !== 5000 || res4.outputBudget !== 2500) {
    throw new Error('Test 5 failed: Adaptive budgets do not match specification.');
  }

  console.log('\nALL CLASSIFIER TESTS PASSED.');
}

runClassifierTests();
