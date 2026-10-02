# Project Tasks

## Status Legend
- `[ ]` Not Started
- `[~]` In Progress
- `[x]` Completed
- `[!]` Blocked
- `[?]` Needs Clarification
- `[-]` Cancelled

---

## Current Roadmap Summary

| Phase | Description | Status |
|---|---|---|
| **Phase 0** | Project Structure, Documentation & Bootstrap | `[x]` Completed |
| **Phase 1** | Core Agent Runtime & Foundation | `[x]` Completed |
| **Phase 2** | Browser Open / Read / Navigation | `[x]` Completed |
| **Phase 3** | Web Search Subsystem | `[x]` Completed |
| **Phase 4** | Browser Semantic Interaction (Click / Type / Scroll) | `[ ]` Ready to Start |
| **Phase 5** | Browser State & Multi-Tab Management | `[ ]` Not Started |
| **Phase 6** | Semantic Form Understanding | `[ ]` Not Started |
| **Phase 7** | Safe Form Filling Engine | `[ ]` Not Started |
| **Phase 8** | File Downloads & Uploads Management | `[ ]` Not Started |
| **Phase 9** | Real Verification Engine | `[ ]` Not Started |
| **Phase 10** | Supervisor & Dynamic Planner Agents | `[ ]` Not Started |
| **Phase 11** | Cross-Session Persistent Memory | `[ ]` Not Started |
| **Phase 12** | Multilingual Speech-To-Text (EN, UR, AR, Mixed) | `[ ]` Not Started |
| **Phase 13** | Edge Natural TTS & Multi-Provider Benchmark | `[ ]` Not Started |
| **Phase 14** | Trilingual Voice Mapping & Audition CLI | `[ ]` Not Started |
| **Phase 15** | Speech Formatting (`prepareForSpeech`) & Sentence Chunking | `[ ]` Not Started |
| **Phase 16** | Barge-In & Audio Interruption Engine | `[ ]` Not Started |
| **Phase 17** | Wake Word & Voice Activation Modes | `[ ]` Not Started |
| **Phase 18** | Interactive Control Center Dashboard | `[ ]` Not Started |
| **Phase 19** | Advanced Autonomous Web Workflows | `[ ]` Not Started |
| **Phase 20** | Computer & Office Capabilities | `[ ]` Not Started |

---

# PHASE 0 — Project Structure & Bootstrap

## TASK-000 — Universal AI Documentation & Memory System Bootstrap
Status: `[x]`  
Priority: Critical  
Objective: Establish the authoritative repository documentation structure (`AGENTS.md`, `PRD.md`, `ARCHITECTURE.md`, `RULES.md`, `DESIGN.md`, `TASKS.md`, `MEMORY.md`) and verify existing project environment.  
Verification: All 7 core documents created and cross-checked against repository reality; Node.js v24+, npm 11+, and `.env` verified.  
Notes: Completed during project initialization.

---

# PHASE 1 — Core Agent Runtime & Foundation

## TASK-101 — Initialize Node.js TypeScript Project Configuration
Status: `[x]`  
Priority: High  
Objective: Set up `package.json`, `tsconfig.json`, build scripts, and test runner (e.g. Vitest / tsx).  
Why: Provides the typed compilation environment, script hooks, and testing framework required for all subsequent phases.  
Dependencies: TASK-000  
Affected Components: `package.json`, `tsconfig.json`, `src/index.ts`  
Verification: Run `npm.cmd run build` and verify clean TypeScript output without errors.  
Acceptance Criteria:
- `package.json` configured with `"type": "module"`.
- `tsconfig.json` set with strict mode, ES2022/ESNext target, and bundler/NodeNext module resolution.
- Test script configured and executable via `npm.cmd test`.

## TASK-102 — Implement Configuration & Environment Manager
Status: `[x]`  
Priority: High  
Objective: Build a type-safe configuration module that loads and validates `.env` settings (`CHEAPERINFERENCE_API_KEY`, `CHEAPERINFERENCE_BASE_URL`, log levels, default voice settings).  
Why: Avoids ad-hoc `process.env` access and guarantees required secrets and endpoints are present at startup.  
Dependencies: TASK-101  
Affected Components: `src/config/env.ts`, `src/config/index.ts`  
Verification: Unit tests verifying missing key detection, default fallback assignments, and valid configuration loading.  
Acceptance Criteria:
- Throws descriptive error if required environment variables are absent.
- Masks sensitive API keys in debug/logging output.

## TASK-103 — Build OpenAI-Compatible AI Client & LLM Gateway
Status: `[x]`  
Priority: High  
Objective: Implement the LLM gateway connecting to CheaperInference OpenAI-compatible endpoint with support for streaming completions, function/tool calling, bounded timeouts, and retries.  
Why: Serves as the cognitive backend for Supervisor, Planner, and specialist agents.  
Dependencies: TASK-102  
Affected Components: `src/ai/client.ts`, `src/ai/gateway.ts`, `tests/unit/ai-client.test.ts`  
Verification: Execute a live smoke test call against CheaperInference API verifying streaming response and tool-call schema parsing.  
Acceptance Criteria:
- Successfully completes chat completions with streaming tokens.
- Handles API errors gracefully with bounded retries.
- Strictly parses structured JSON tool calls.

## TASK-104 — Create Typed Tool Registry & Base Agent Abstraction
Status: `[x]`  
Priority: High  
Objective: Build an extensible `ToolRegistry` with typed input/output schemas (Zod or JSON Schema) and structured result envelopes (`success`, `action`, `evidence`, `error`), along with the base `Agent` class.  
Why: Guarantees standardized tool execution, structured evidence tracking, and anti-hallucination validation across all specialist agents.  
Dependencies: TASK-103  
Affected Components: `src/tools/registry.ts`, `src/tools/types.ts`, `src/agents/base.ts`  
Verification: Unit test registering sample tools, executing them with schema validation, and verifying structured evidence outputs.  
Acceptance Criteria:
- Tool inputs validated against schema before execution.
- Returns standardized result envelope with mandatory `evidence` payload.
- Base agent provides standardized lifecycle hooks (`observe`, `decide`, `act`, `verify`).

---

# PHASE 2 — Browser Open, Read & Navigation

## TASK-201 — Setup Playwright Engine & Browser Lifecycle Controller
Status: `[x]`  
Priority: High  
Objective: Integrate Playwright Chromium with support for both headed (user visible) and headless modes, session isolation, and graceful shutdown.  
Dependencies: TASK-104  
Affected Components: `src/browser/controller.ts`, `src/browser/types.ts`  
Acceptance Criteria: Headed and headless browser lifecycle tested; auto-closes on process exit.

## TASK-202 — Implement Browser Navigation & DOM Content Extractor
Status: `[x]`  
Priority: High  
Objective: Build `browser.open_url`, `browser.read_page`, and `browser.get_title` using semantic DOM parsing and bounded wait strategies (no naked `networkidle`).  
Dependencies: TASK-201  
Acceptance Criteria: Successfully navigates to live web URL, extracts semantic text, strips ads/scripts, and verifies URL changed.

---

# PHASE 3 — Web Search Subsystem

## TASK-301 — Implement SearchAgent & Query Formulator
Status: `[x]`  
Priority: High  
Objective: Build search capability via public search engine automation and site-specific search, returning verified links, titles, and snippets.  
Dependencies: TASK-202  
Acceptance Criteria: Querying returns structured list of sources; distinguishes official from third-party links.

---

# PHASE 4 — Browser Semantic Interaction (Click / Type / Scroll)

## TASK-401 — Implement Accessible Role & Text-Based Interaction Tools
Status: `[x]`  
Priority: High  
Objective: Implement `browser.click`, `browser.type`, `browser.clear`, `browser.scroll`, `browser.select` targeting accessible roles (`button`, `link`, `textbox`), labels, and text.  
Dependencies: TASK-202  
Verification: `tests/browser/interaction.test.ts` (15 tests passing) verifying clicks, labels, placeholders, dropdowns, checkboxes, radios, key presses, and scrolling without coordinate targeting.  
Acceptance Criteria: Successfully clicks buttons, types into inputs, and scrolls on dynamic test pages without relying on screen coordinates.

---

# PHASE 5 — Browser State & Multi-Tab Management

## TASK-501 — Implement TabRegistry & Multi-Tab Controller
Status: `[x]`  
Priority: Medium  
Objective: Track open tabs, active URLs, page titles, and associated task context; support `open_tab`, `close_tab`, `switch_tab`.  
Dependencies: TASK-401  
Verification: `tests/browser/tabs.test.ts` (9 tests passing) verifying tab creation, context retention, switching, closing, automatic page event sync, and tool envelope.  
Acceptance Criteria: Accurately switches between multiple open tabs and preserves per-tab task context.

---

# PHASE 6 — Semantic Form Understanding

## TASK-601 — Implement Form Inspection Engine
Status: `[x]`  
Priority: High  
Objective: Scan web forms to discover fields, labels, required attributes, input types, and existing values.  
Dependencies: TASK-401  
Verification: `tests/forms/inspector.test.ts` (4 tests passing) verifying discovery of text, email, password, select options, textarea, checkbox, aria-required flags, submit buttons, and tool envelope.  
Acceptance Criteria: Produces a structured field dictionary from complex registration and contact forms.

---

# PHASE 7 — Safe Form Filling Engine

## TASK-701 — Implement FormAgent with Decoupled Fill vs. Submit
Status: `[x]`  
Priority: High  
Objective: Populate form fields from user data (R1 risk); halt for user authorization before submitting (R2 risk).  
Dependencies: TASK-601  
Verification: `tests/forms/form-agent.test.ts` (8 tests passing) verifying decoupled draft population, required field validation, authorization-gated submission, dual speech/display outputs, and tool envelope.  
Acceptance Criteria: All draft fields populated accurately; submission blocked until explicit user command.

---

# PHASE 8 — File Downloads & Uploads Management

## TASK-801 — Implement Download & Upload Manager
Status: `[x]`  
Priority: High  
Objective: Manage file downloads with Playwright download events, verify file on disk (size > 0), and handle file input uploads.  
Dependencies: TASK-401  
Verification: `tests/files/manager.test.ts` (8 tests passing) verifying download interception, disk existence, byte size > 0, SHA256 checksums, DOM file input attachments, and tool envelope.  
Acceptance Criteria: Verified file existence, path, and size; prompts user when upload candidates are ambiguous.

---

# PHASE 9 — Real Verification Engine

## TASK-901 — Build VerificationService & Pre/Post State Inspector
Status: `[ ]`  
Priority: Critical  
Objective: Independent verification engine checking pre/post conditions (URL change, DOM confirmation text, file existence). Rejects fake success.  
Dependencies: TASK-104, TASK-202, TASK-801  
Acceptance Criteria: Correctly flags unconfirmed actions as `FAILED` or `WAITING_FOR_USER`.

---

# PHASE 10 — Supervisor & Dynamic Planner Agents

## TASK-1001 — Implement PlannerAgent with DAG Step Decomposition
Status: `[ ]`  
Priority: High  
Objective: Break complex multi-step user prompts into actionable tool steps with dependency tracking and recovery branches.  
Dependencies: TASK-104, TASK-901  
Acceptance Criteria: Plans complex flows (search -> open -> extract -> summarize -> download).

## TASK-1002 — Implement SupervisorAgent Orchestrator
Status: `[ ]`  
Priority: High  
Objective: Central controller coordinating intent parsing, risk tier enforcement (R0-R3), specialist delegation, and output splitting.  
Dependencies: TASK-1001  
Acceptance Criteria: Autonomous execution of multi-agent tasks with permission checks on R2 actions.

---

# PHASE 11 — Cross-Session Persistent Memory

## TASK-1101 — Implement MemoryAgent & Session Store
Status: `[ ]`  
Priority: Medium  
Objective: Persist task history, workflow states, and user preferences across application restarts; strictly exclude credentials.  
Dependencies: TASK-1002  
Acceptance Criteria: Restores previous session context on restart without credential leakage.

---

# PHASE 12 — Multilingual Speech-To-Text (EN, UR, AR, Mixed)

## TASK-1201 — Implement STTProvider & Language Identification
Status: `[ ]`  
Priority: High  
Objective: Multilingual speech recognition supporting English, Urdu, Arabic, and code-switched technical speech with confidence scores.  
Dependencies: TASK-1002  
Acceptance Criteria: Correctly transcribes test audio samples in EN, UR, AR, and Mixed phrases.

---

# PHASE 13 — Edge Natural TTS & Multi-Provider Benchmark

## TASK-1301 — Build TTSProviderManager & Edge TTS Client
Status: `[ ]`  
Priority: High  
Objective: Implement Edge TTS integration and benchmark against alternative engines for English, Urdu, and Arabic.  
Dependencies: TASK-1002  
Acceptance Criteria: Produces real audio files for all test phrases; evaluates warmth, latency, and pronunciation.

---

# PHASE 14 — Trilingual Voice Mapping & Audition CLI

## TASK-1401 — Implement Voice Audition Utility (`npm run voices`)
Status: `[ ]`  
Priority: Medium  
Objective: CLI utility to audition, benchmark, and configure preferred voices for English, Urdu, and Arabic.  
Dependencies: TASK-1301  
Acceptance Criteria: Generates standardized listening samples and saves user-approved voice mapping to configuration.

---

# PHASE 15 — Speech Formatting & Sentence Chunking

## TASK-1501 — Implement `prepareForSpeech` & Streaming Audio Segmenter
Status: `[ ]`  
Priority: High  
Objective: Filter out markdown, raw URLs, and code from spoken text; chunk LLM streaming output by sentence for immediate playback.  
Dependencies: TASK-1301  
Acceptance Criteria: Audio playback commences on first sentence before total response generation finishes.

---

# PHASE 16 — Barge-In & Audio Interruption Engine

## TASK-1601 — Implement Playback Interruption & Queue Flushing
Status: `[ ]`  
Priority: High  
Objective: Cancel playing audio within 50ms upon user voice detection; preserve task context and process new input.  
Dependencies: TASK-1501  
Acceptance Criteria: Assistant voice instantly stops when interrupted by user command.

---

# PHASE 17 — Wake Word & Voice Activation Modes

## TASK-1701 — Implement Wake Word & Push-to-Talk Subsystem
Status: `[ ]`  
Priority: Medium  
Objective: Support "Hey Jarvis" / "Jarvis" activation, push-to-talk keybinds, and continuous conversation mode.  
Dependencies: TASK-1601  
Acceptance Criteria: Accurately triggers voice processing on wake word detection.

---

# PHASE 18 — Interactive Control Center Dashboard

## TASK-1801 — Build Control Center UI & Telemetry Stream
Status: `[ ]`  
Priority: Medium  
Objective: Web dashboard visualizing real-time agent plans, open tabs, active tools, speech latency, and authorization prompts.  
Dependencies: TASK-1002, TASK-1501  
Acceptance Criteria: Live UI displaying real-time agent thoughts, browser status, and logs.

---

# PHASE 19 — Advanced Autonomous Web Workflows

## TASK-1901 — Multi-Source Research & Synthesis Workflows
Status: `[ ]`  
Priority: Medium  
Objective: End-to-end execution of complex research, document extraction, cross-referencing, and PDF downloads.  
Dependencies: TASK-1002, TASK-901, TASK-801  
Acceptance Criteria: Autonomous execution of 5+ step workflows with complete citations and verified artifacts.

---

# PHASE 20 — Computer & Office Capabilities

## TASK-2001 — Desktop Automation & Office Integrations (Future)
Status: `[ ]`  
Priority: Low  
Objective: Expand capabilities to desktop applications, Excel/Word processing, and local file organization.  
Dependencies: TASK-1901  
Acceptance Criteria: To be specified when entering Phase 20.
