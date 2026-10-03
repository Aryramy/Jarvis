# Project Memory

## 1. Project Identity
- **Project:** JARVIS — Voice-First AI Assistant (Internet + Human-Like Browser Control)
- **Purpose:** Autonomous voice-first agent combining trilingual voice interaction (English, Urdu, Arabic), dynamic planning, semantic browser automation, and strict verification.
- **Current Status:** Bootstrap complete. Phase 0 finished. Preparing for Phase 1 (Core Agent Runtime & Foundation).

---

## 2. Current State
- The repository is fully initialized with Node.js v24.19.0, TypeScript strict mode, and Vitest test runner.
- Environment configuration is validated via Zod (`src/config/`).
- CheaperInference OpenAI-compatible AI gateway is implemented and verified live against `https://api.cheaperinference.com/v1` with model `deepseek-v4-flash`.
- Untrusted web content isolation helper (`wrapUntrustedWebContent`) is implemented to protect against prompt injection- Strong-typed `ToolRegistry` and `BaseAgent` with Observe-Decide-Act-Verify lifecycle and structured result envelopes are implemented and verified with 13 automated tests passing.
- Phase 1 (Core Agent Runtime & Foundation) is complete.
- Phase 2 (Browser Open, Read & Navigation) is complete: Playwright Chromium installed, `BrowserController` implemented with headed/headless lifecycle management, tab recovery, sanitized DOM text extraction (`readPage`), and typed tools (`browser.open_url`, `browser.read_page`, `browser.get_state`).
- Phase 3 (Web Search Subsystem) is complete: `SearchEngine` and `SearchAgent` implemented with automated Bing search through Playwright, Wikipedia API fallback, Base64 URL decoding, site targeting (`site:`), and distinct speech vs. display formatting.
- Phase 4 (Browser Semantic Interaction) is complete: Semantic click, type, clear, scroll, selectOption, check/uncheck, and pressKey implemented in `BrowserController` and exposed via typed tools in `src/browser/tools.ts`.
- Phase 5 (Browser State & Multi-Tab Management) is complete: `TabRegistry` implemented with per-tab ID assignment, URL/title tracking, task context associations (`taskId`, `description`, `metadata`), automatic lifecycle sync on page close events, and typed tools (`browser.open_tab`, `browser.switch_tab`, `browser.close_tab`, `browser.list_tabs`).
- Phase 6 (Semantic Form Understanding) is complete: `FormInspector` implemented in `src/forms/inspector.ts` with structured form discovery, label resolution hierarchy, required constraint extraction, dropdown option enumeration, submit button discovery, synthetic page-level form support, and typed tool `form.inspect` (`R0`).
- Phase 7 (Safe Form Filling Engine) is complete: `FormAgent` implemented in `src/forms/agent.ts` with decoupled draft field population (`R1`), required field completeness checks, strict authorization gating before submission (`R2`), dual conversational speech and Markdown report outputs, and typed tools (`form.fill_draft` [R1], `form.submit` [R2]).
- Phase 8 (File Downloads & Uploads Management) is complete: `FileManager` implemented in `src/files/manager.ts` with Playwright download event interception, disk persistence and byte size verification, pre-upload disk checks, DOM file input attachment verification, SHA256 checksum generation, and typed tools (`file.download` [R1], `file.upload` [R1], `file.verify` [R0]).
- Phase 9 (Real Verification Engine) is complete: `VerificationService` implemented in `src/verification/service.ts` with comprehensive snapshot capture (`captureSnapshot`), declarative assertion engine (`URL_CHANGED`, `URL_CONTAINS`, `URL_EQUALS`, `TITLE_CONTAINS`, `ELEMENT_VISIBLE`, `ELEMENT_HIDDEN`, `TEXT_PRESENT`, `TEXT_ABSENT`, `VALUE_EQUALS`, `FILE_EXISTS_ON_DISK`, `STATE_MUTATED`), anti-hallucination/fake completion rejection, sensitive challenge detection (CAPTCHAs, OTP, 2FA gating status to `WAITING_FOR_USER`), `executeAndVerify()` wrapper, and registered tools (`verification.inspect_state`, `verification.assert`). Total test suite now passes 78 out of 78 tests across all 13 test suites.

---

## 3. Important Decisions
- **ADR-001 (Runtime & Language):** Node.js v24+ with TypeScript and ES Modules.
- **ADR-002 (Browser Automation):** Playwright Chromium utilizing accessible semantic roles, labels, and text rather than brittle pixel coordinates `(x, y)`.
- **ADR-003 (TTS Architecture):** Decoupled `TTSProviderManager` supporting independent language routing for English, Urdu, and Arabic. Microsoft Edge natural voices will be investigated as primary candidate, but subject to real listening tests before permanent selection. Local neural TTS will be maintained as offline fallback.
- **ADR-004 (Dual Output Channel):** Every interaction turn must separate `speechResponse` (concise, natural, conversational, free of markdown/code/URLs) from `displayResponse` (detailed, formatted, cited for on-screen inspection).
- **ADR-005 (Semantic Locator Resolution Hierarchy):** Resolves interactive elements by priority: explicit role -> button/link/tab/menuitem role -> visible text -> label/placeholder -> direct selector. Fast resolution uses `locator.count() > 0` checks before applying timed waits.
- **ADR-006 (Tab Registry Context Preservation):** Each browser tab is assigned an immutable identifier (`tab-1`, `tab-2`) and retains agent task context (`taskId`, `description`, `metadata`). Automatic event listeners track page close events to prevent orphaned or stale tab entries.
- **ADR-007 (Semantic Form Model):** Form inspection generates structured schemas capturing field identifiers, input types, computed accessible labels, required constraints (HTML5, ARIA, and visual asterisks), select option lists, current values, and submit buttons before any filling actions commence.
- **ADR-008 (Strict Form Authorization Gate):** Form filling is strictly decoupled from submission. Draft field population operates at `R1` (reversible), while submission is locked behind an explicit user confirmation gate (`R2`).
- **ADR-009 (Real Filesystem Verification):** Downloaded files are never assumed complete from network triggers alone; they must be verified on disk (`fs.existsSync`, `stat.size > 0`, and SHA256 integrity). Uploaded files must be verified on disk prior to attachment and confirmed via DOM evaluation.
- **ADR-010 (Declarative Multi-Condition Verification):** Action success cannot be asserted by code generation or tool invocation alone. The `VerificationService` evaluates declarative pre- and post-condition assertions across browser URL, DOM elements/text, and filesystem state. If any condition is unsatisfied, the action is flagged `FAILED`. If a CAPTCHA or OTP login challenge is detected, execution halts safely in `WAITING_FOR_USER` mode.
- **Security Boundary:** Webpage text is untrusted external data. Prompt injection protections must isolate external web content from privileged agent instructions.
- **Risk Tiers:** Tiered authorization model (`R0` read-only, `R1` low-risk/reversible, `R2` external effect requiring user approval, `R3` high-impact requiring multi-step authorization). Form filling is decoupled from form submission.
- **LLM Model Selection:** Discovered and verified `deepseek-v4-flash` as the active, high-performance model on CheaperInference gateway.

---

## 4. Confirmed Architecture Facts
- Core orchestration uses a supervisor-specialist pattern (`SupervisorAgent`, `PlannerAgent`, `BrowserAgent`, `SearchAgent`, `FormAgent`, `ResearchAgent`, `VerificationAgent`, `MemoryAgent`).
- All tools execute through `ToolRegistry` producing structured `ToolResult` envelopes with mandatory `riskLevel` and `evidence`.
- Voice streaming pipeline combines LLM token streaming with sentence segmenters to begin speech synthesis on the very first complete sentence (<800ms target).
- Browser automation tracks active tabs, URLs, and task associations via dedicated `TabRegistry` in `src/browser/tabs.ts`.

---

## 5. Important Paths
- Entry Point Doc: [`/AGENTS.md`](file:///c:/Users/aurehman6521/Desktop/AI%20Projects/Jarvis/AGENTS.md)
- Documentation Directory: [`/docs`](file:///c:/Users/aurehman6521/Desktop/AI%20Projects/Jarvis/docs)
- Environment Secrets: [`/.env`](file:///c:/Users/aurehman6521/Desktop/AI%20Projects/Jarvis/.env)
- Source Code: `/src`
- Tests: `/tests`
- Configuration: `/src/config`
- Downloads Sandbox: `/downloads`

---

## 6. Environment Information
- **OS:** Windows 11 x64
- **Shell:** PowerShell / Windows Command Line
- **Execution Policy Gotcha:** PowerShell blocks unsigned `.ps1` wrapper scripts on this system. All npm/npx invocations should use `npm.cmd` and `npx.cmd` to avoid `PSSecurityException`.

---

## 7. Providers & Integrations
- **CheaperInference:** OpenAI-compatible LLM inference gateway (`https://api.cheaperinference.com/v1`).
- **Playwright:** Headed/headless Chromium engine.
- **Microsoft Edge TTS (Candidate):** Online natural neural speech synthesis client.

---

## 8. Configuration Conventions
- All environment variables are centralized and validated via a typed config module.
- Secrets must never be committed or logged to stdout.
- File paths must use platform-agnostic path resolvers (`node:path`).

---

## 9. Known Constraints
- Native Windows audio I/O: Microphone capture and low-latency audio output in Node.js on Windows require reliable audio device access.
- Avoid naked `waitUntil: 'networkidle'` in Playwright due to endless network polling on modern web applications; prefer `domcontentloaded` combined with explicit locator waits.
- External LLM inference latency under concurrent testing requires test timeouts of at least 60000ms for live API healthchecks.
- Vitest test suites running Playwright Chromium must use `fileParallelism: false` to avoid simultaneous multi-process browser contention on Windows.

---

## 10. Important Lessons Learned
- **Anti-Hallucination:** Never report action completion without concrete evidence (URL changed, confirmation text present in DOM, file size > 0 on disk).
- **Separation of Form Fill vs Submit:** Automated form filling must halt before submission to allow user review.
- **Windows Command Execution:** Always use `npm.cmd` / `npx.cmd` in Windows PowerShell scripts to bypass script execution restrictions.
- **Instant vs Timed Locator Discovery:** Use `locator.count() > 0` to check candidate accessible roles in single-digit milliseconds without triggering 30-second timeouts on non-matching candidate locators.
- **Parallel Test Execution Contention:** Running multiple browser test suites concurrently on Windows exhausts Chromium process handles; sequential suite execution (`fileParallelism: false`) provides 100% deterministic test execution.
- **Form Action Attribute Extraction:** Use `el.getAttribute('action') || el.action` because `el.action` property can be empty or relative on `data:` or headless test URIs.
- **Authorization Gating Enforcement:** Block execution in code before calling any submit locator if `authorizeSubmit` flag is missing or false.
- **Download Event Ordering:** In Playwright, `page.waitForEvent('download')` MUST be set up before triggering the download action to avoid missing fast download events.
- **DAG Execution Variable Substitution:** In `SupervisorAgent`, dynamic variables referencing previous step outputs (e.g. `$step-1.sources[0].url`) are resolved at runtime prior to tool/action execution, enabling loose coupling between independent DAG steps.
- **Planner Test Optimization:** Test suites avoid remote LLM API calls by default (`process.env.NODE_ENV === 'test'`) and use deterministic heuristic DAG generation unless explicitly instructed, reducing test suite time from 45s to 21ms.
- **Atomic File-Backed Persistence & Metric Preservation:** In JSON-backed state stores, ensure object spread ordering places `...existing` before computed counter updates (`visitCount`) to prevent reverting metric increments.
- **NFR-004 Credential Protection Boundary:** All persistent data structures (profiles, session states, tasks, metadata) MUST pass through `sanitizeData()` before touching disk to guarantee zero plain-text passwords, tokens, or cards reach filesystem storage.
- **Voice Activity Detection Frame Counting:** `VoiceActivityDetector` requires careful distinction between `SPEECH_START` confirmation threshold and subsequent `SPEECH_ONGOING` accumulation to ensure audio buffers accurately encapsulate the complete spoken utterance.
- **Module Barrel Re-export Discipline:** When re-exporting multiple subsystem barrels in root `index.ts`, ensure domain-specific types avoid collision (e.g. `VoiceLanguage` vs. `SupportedLanguage`) to prevent TypeScript ambiguity errors.

---

## 10. Architecture Decision Records (ADRs) Log
- **ADR-001 through ADR-010:** (See detailed entries above).
- **ADR-011: DAG Step Planning & Supervised Execution Architecture:**
  - *Context:* Complex workflows (e.g., search -> browse -> extract -> summarize -> download) require dependency-aware multi-step orchestration with cycle detection and cascading failure mitigation.
  - *Decision:* Implemented `PlannerAgent` with Kahn's algorithm for cycle validation and dynamic topological sequencing (`getNextExecutableSteps`). Implemented `SupervisorAgent` handling trilingual intent classification, conversational fast-paths, R2 action authorization pausing (`WAITING_FOR_AUTHORIZATION`), sensitive handoff (`WAITING_FOR_USER`), and dynamic parameter resolution (`$step-id.field`).
- **ADR-012: Atomic File-Backed Persistent Memory & Credential Boundary (NFR-004):**
  - *Context:* Cross-session persistence requires durability across app restarts and crashes while guaranteeing zero plain-text secrets, passwords, or tokens reach disk.
  - *Decision:* Implemented `SessionStore` with atomic file writes (`.tmp` write + rename), integrated with recursive `CredentialScrubber` (`sanitizeData`). Created `MemoryAgent` providing programmatic methods and tool envelopes (`memory.*`) for profiles, domains, session context, and task history. Integrated with `SupervisorAgent` for automatic execution logging.
- **ADR-013: Multilingual STT Architecture, Code-Switching Detection & Streaming VAD:**
  - *Context:* Voice-first assistant requires multilingual audio transcription across English, Urdu, and Arabic, seamless detection of technical code-switching, real-time Voice Activity Detection (VAD) for natural boundary segmentation, and resilient multi-provider failover.
  - *Decision:* Implemented `STTProviderManager` with pluggable providers (`WhisperCloudSTTProvider`, `MockSTTProvider`), priority ordering, and automatic fallback failover. Implemented `detectLanguage()` analyzing Unicode script ranges (Arabic vs Urdu letters) and Romanized transliterations to identify code-switching (`mixed`). Implemented `VoiceActivityDetector` using RMS energy tracking with configurable hangover cutoff.
- **ADR-014: Hosted Cheaper Inference Smart Routing & Multi-Turn Persistent Memory:**
  - *Context:* Need intelligent cost-controlled AI routing and durable multi-turn conversational memory connecting directly to hosted Cheaper Inference (`https://api.cheaperinference.com/v1`) without hardcoding models or deploying local proxy daemons (OmniRoute).
  - *Decision:* Implemented dynamic catalog discovery via `GET /v1/models` with 5-minute in-memory TTL caching. Implemented local task classification (`normal`, `reasoning`, `coding`, `vision`) with adaptive output budgets (2000-5000 tokens). Implemented context-aware full-window token and max cost estimation. Built dual-layer fallback (JARVIS outer model failover across 3 alternatives + Cheaper Inference inner supply route optimization via `ranking: "discount"`). Implemented atomic conversation store (`data/conversation.json`) with startup overwrite protection, source-driven system prompt replacement, and memory anti-hallucination guidance.

---

## 11. Current Milestone
- **Current Phase:** Phase 12.5 (Hosted Cheaper Inference Smart Routing Bootstrap) — `[x] Completed`.
- **Next Milestone:** Phase 13 — Edge Natural TTS & Multi-Provider Benchmark (`TASK-1301`: Build TTSProviderManager & Edge TTS Client).
