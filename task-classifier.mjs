const CODING_REGEX = /\b(code|coding|debug|bug|error|exception|javascript|typescript|python|node|node\.js|react|html|css|sql|api|function|class|npm|powershell|terminal|command|refactor|repository|compile|build|\.ts|\.js|\.py|\.sh|\.ps1)\b|```/i;

const REASONING_REGEX = /\b(analyze|analyse|compare|reason|why|explain the logic|step by step|architecture|design|plan|strategy|solve|evaluate|investigate|root cause|optimize|optimise|tradeoff|trade-off)\b/i;

export function classifyTask(text = '', hasImage = false) {
  const isCoding = CODING_REGEX.test(text);
  const isDirectReasoning = REASONING_REGEX.test(text);
  const isVision = Boolean(hasImage);

  // Per Section 10: Coding should initially imply reasoning = true
  const isReasoning = isDirectReasoning || isCoding;

  let type = 'normal';
  if (isVision) {
    type = 'vision';
  } else if (isCoding) {
    type = 'coding';
  } else if (isReasoning) {
    type = 'reasoning';
  }

  return {
    type,
    coding: isCoding,
    reasoning: isReasoning,
    vision: isVision,
    outputBudget: getAdaptiveOutputBudget({ vision: isVision, reasoning: isReasoning, coding: isCoding }),
  };
}

export function getAdaptiveOutputBudget({ vision = false, reasoning = false, coding = false }) {
  if (vision && reasoning) {
    return 3500;
  }
  if (coding) {
    return 5000;
  }
  if (reasoning) {
    return 3000;
  }
  if (vision) {
    return 2500;
  }
  return 2000;
}
