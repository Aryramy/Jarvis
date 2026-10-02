# Design System & Interaction Guidelines

## 1. Design Philosophy
JARVIS is a **voice-first, action-capable digital assistant**. The user experience is anchored by two complementary interaction surfaces:
1. **Auditory Surface (Hands-Free Voice):** Fast, warm, concise, and natural speech designed to keep the user informed without cognitive fatigue.
2. **Visual Surface (Interactive Control Center):** A sleek, dark-mode, high-density dashboard providing real-time observability into the agent's thoughts, plans, browser tabs, telemetry, and actions.

---

## 2. Voice UX Principles

### 2.1 Spoken vs. Screen Response Separation
- **`speechResponse`:** Designed strictly for listening. Must be concise (1–3 sentences), conversational, and direct. It answers the user's primary query or announces verified action results.
- **`displayResponse`:** Designed for reading and scanning. Contains comprehensive markdown tables, full code snippets, complete citations, URLs, and multi-paragraph technical summaries.

### 2.2 Speech Formatting Rules (`prepareForSpeech`)
Before any text is passed to the TTS queue, it must undergo automated speech formatting:
- **Markdown Removal:** Strip headers (`#`), bold/italic (`**`, `*`), bullet points (`-`, `*`), and blockquotes.
- **URL Handling:** Never read raw URLs (e.g. `https://learn.microsoft.com/...`). Convert to natural language: *"I found the official Microsoft documentation page."*
- **Code & JSON Blocks:** Do not read raw syntax aloud. Summarize: *"I've generated the TypeScript code on your screen."*
- **Symbols & Telemetry:** Convert abbreviations and symbols to spoken equivalents (e.g., `%` -> *"percent"*, `&` -> *"and"*).
- **Technical Product Preservation:** Maintain proper English pronunciation for technical terms (*Power BI*, *Microsoft Fabric*, *Docker*, *Playwright*) even during Urdu or Arabic conversational responses.

### 2.3 Conversational Pacing & Streaming Chunking
- Output text from the LLM is piped directly into a sentence boundary segmenter.
- Synthesis of Sentence 1 begins as soon as the first period, question mark, or exclamation mark is encountered.
- Sentence 2 synthesizes while Sentence 1 plays.
- Target latency to first audio: **< 800ms**.

### 2.4 Barge-In & Interruption Ergonomics
- The voice capture engine constantly listens for user speech or wake words during assistant playback.
- When an interruption occurs:
  1. Assistant audio playback stops within **50ms**.
  2. Queued audio chunks are flushed immediately.
  3. The microphone transitions into active transcription mode.
  4. The current browser/task state is frozen (not discarded) to allow context-aware follow-up.

---

## 3. Control Center Visual Design System

### 3.1 Aesthetic & Theme
The Control Center adheres to a **Sleek HUD / High-Tech Glassmorphism** aesthetic:
- **Base Mode:** Deep Obsidian Dark Mode.
- **Accents:** Electric Cyan (`#00F0FF`), Neon Amber (`#FFB800`), Emerald Success (`#00E676`), Crimson Alert (`#FF1744`).
- **Surfaces:** Translucent acrylic panels with subtle blur (`backdrop-filter: blur(16px)`), razor-thin borders (`1px solid rgba(255, 255, 255, 0.08)`), and soft outer glow shadows.

### 3.2 Color Tokens (HSL Tailored)

| Token | HSL / Hex | Usage |
|---|---|---|
| `--bg-void` | `hsl(224, 71%, 4%)` (`#030712`) | Root canvas background |
| `--bg-surface` | `hsla(220, 39%, 10%, 0.75)` | Translucent dashboard cards & panels |
| `--border-subtle` | `hsla(220, 20%, 30%, 0.35)` | Panel dividers and card borders |
| `--text-primary` | `hsl(210, 40%, 98%)` | Primary headings and key outputs |
| `--text-secondary` | `hsl(215, 20%, 65%)` | Subtitles, timestamps, telemetry labels |
| `--accent-cyan` | `hsl(187, 100%, 50%)` | Active agent, browser cursor, focus states |
| `--accent-amber` | `hsl(43, 100%, 50%)` | In-progress tasks, pending authorization |
| `--status-success` | `hsl(150, 100%, 45%)` | Verified actions, healthy providers |
| `--status-error` | `hsl(350, 100%, 54%)` | Action failure, timeout, unverified state |

### 3.3 Typography
- **Primary Interface Font:** `'Inter'`, `system-ui`, `-apple-system`, `sans-serif` (clean, highly legible at micro-sizes).
- **Telemetry & Code Font:** `'JetBrains Mono'`, `'Fira Code'`, `monospace` (aligned column data, latency counters, logs).
- **Scale:**
  - Display Title: `24px` / `bold` / letter-spacing: `-0.02em`
  - Panel Header: `14px` / `semibold` / uppercase / letter-spacing: `0.05em`
  - Body Text: `13px` / `normal` / line-height: `1.5`
  - Telemetry / Badges: `11px` / `medium` / monospace

### 3.4 Key Control Center Dashboard Panels
1. **Header HUD:** System status (`ONLINE`, `LISTENING`, `THINKING`, `SPEAKING`), detected language indicator (`EN`, `UR`, `AR`, `MIXED`), active TTS provider, latency badge.
2. **Conversation & Transcript Stream:** Bi-directional chat stream showing user spoken transcripts, agent's `speechResponse`, and expandable `displayResponse`.
3. **Execution Plan & Task DAG:** Real-time tree showing current goal, sub-tasks, and live statuses (`[~] In Progress`, `[x] Completed`, `[!] Failed`).
4. **Browser & Tab Inspector:** Live view of open browser tabs, active URL, page title, screenshot thumbnail, and last executed DOM action.
5. **Security & Authorization Modal:** Prominent confirmation dialogue for `R2` / `R3` actions (e.g. form submission, external transactions) displaying exact target data before execution.
6. **Telemetry & Logs:** Filterable real-time event logs (Tool calls, verification checks, audio buffer events).

---

## 4. Accessibility & Responsiveness
- **High Contrast:** All text tokens meet WCAG AAA contrast requirements against dark surface backgrounds.
- **Keyboard Navigation:** Full accessibility via keyboard shortcuts (e.g. `Space` to Push-to-Talk, `Esc` to cancel/barge-in, `Ctrl+Enter` to authorize `R2` actions).
- **Semantic HTML:** Proper headings (`h1` through `h4`), button tags with distinct accessible labels, and ARIA live regions for speech transcripts.
