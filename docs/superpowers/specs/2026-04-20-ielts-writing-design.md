# IELTS Writing Practice — Design Spec

**Date:** 2026-04-20
**Scope:** MVP v1

## 1. Goal

A companion app to `ielts-speaking` that lets students practise IELTS Academic
**Writing Task 1** (chart description) and **Task 2** (essay) with realistic
timed conditions, handwritten submission, and strict AI grading anchored to
the public band descriptors.

## 2. User flow

1. Open `index.html`, choose Task 1 or Task 2.
2. App shows a question:
   - **T1**: a chart rendered with Chart.js (bar / line / pie / table).
   - **T2**: an essay prompt.
3. Timer starts — 20 min (T1) or 40 min (T2). Advisory only, colour-shifts in
   the last 5 min, never auto-submits (can't stop a pen).
4. Student writes the answer by hand on paper.
5. Student uploads 1–4 photos of their handwritten page(s).
6. Gemini 2.5 Flash transcribes the handwriting; the app shows the transcript
   in an editable textarea for the student to correct OCR errors.
7. Student clicks **Grade it**. App sends the verified transcript + question
   context to Gemini with a strict 4-pass writing-examiner prompt.
8. Student sees: bands table (4 criteria + overall), "what you did well",
   "what to work on", "your focus for next time", a model answer one half-band
   above, and a collapsible examiner breakdown with quoted evidence.

## 3. Architecture & repo layout

Static HTML + vanilla JS + CSS, no bundler. Mirrors the `ielts-speaking`
structure so a developer familiar with either repo can navigate the other.

```
ielts-writing
├── index.html                 Landing page — pick a task, view past attempts
├── task1-academic.html        T1 practice page
├── task2.html                 T2 practice page
├── scripts/
│   ├── writingCoachAI.js      Gemini wrapper + strict writing-grading prompt
│   ├── chartRenderer.js       Chart.js helpers (bar / line / pie / HTML table)
│   ├── handwritingUpload.js   Multi-photo upload, preview, OCR call, transcript gate
│   ├── taskTimer.js           20-/40-min advisory timer
│   ├── task1Practice.js       Page controller for T1
│   ├── task2Practice.js       Page controller for T2
│   └── workHistory.js         localStorage attempt history
├── data/
│   ├── task1-charts.json      20 T1 questions (5 bar, 5 line, 5 pie, 5 table)
│   └── task2-prompts.json     25 T2 questions (5 each of 5 essay types)
├── styles/
│   ├── common.css             Design tokens (reused from speaking palette)
│   ├── task1.css
│   └── task2.css
├── shared/                    Git submodule — vocab-learner-shared
├── docs/
│   └── superpowers/specs/…    Spec docs
└── README.md
```

External dependencies (all via CDN, no install step):

- `chart.js@4` — chart rendering.
- `@google/genai` — Gemini SDK (reused from speaking).
- Google Fonts: DM Serif Display + Plus Jakarta Sans (reused for visual parity).

## 4. Data models

### 4.1 T1 chart question (`data/task1-charts.json`)

```json
{
  "id": "t1-bar-001",
  "type": "bar",              // bar | line | pie | table
  "title": "Monthly household expenses in Country X, 2020",
  "prompt": "The chart below shows... Summarise the information by selecting and reporting the main features.",
  "unit": "USD",              // optional
  "xLabel": "Month",          // optional (not used for pie/table)
  "yLabel": "Spending (USD)",
  "categories": ["Jan", "Feb", "Mar"],
  "series": [
    { "name": "Food", "values": [320, 340, 310] },
    { "name": "Housing", "values": [800, 800, 820] }
  ]
}
```

`chartRenderer.js` accepts this schema and renders into a `<canvas>` (bar / line / pie)
or an HTML `<table>` (type === "table").

### 4.2 T2 prompt (`data/task2-prompts.json`)

```json
{
  "id": "t2-opinion-001",
  "essayType": "opinion",     // opinion | discussion | problem-solution | two-part | advantages-disadvantages
  "prompt": "Some people believe… To what extent do you agree or disagree?"
}
```

### 4.3 Attempt record (localStorage, per task)

Keys: `iw_attempts_t1`, `iw_attempts_t2`. Value: array, capped at 20 most
recent. Each entry:

```json
{
  "id": "<uuid>",
  "timestamp": 1740000000000,
  "questionId": "t1-bar-001",
  "elapsedSeconds": 1205,
  "wordCount": 168,
  "transcript": "…",
  "bands": { "ta": 6.0, "cc": 5.5, "lr": 6.0, "gra": 5.5, "overall": 5.5 },
  "feedbackMarkdown": "…"
}
```

Photos are **not stored** in localStorage — quota would fill after a handful
of attempts. Photos live in memory for the current session only.

## 5. Gemini integration

Two API calls per submission:

### 5.1 OCR transcription

Model: `gemini-2.5-flash`. Inline images + prompt:
"Transcribe the handwritten IELTS Writing response exactly as written.
Preserve paragraph breaks. Mark illegible words with [illegible]. Do not
correct spelling or grammar."

Response rendered in an editable textarea. Student can correct any OCR errors
and must click **Grade it** to proceed.

### 5.2 Strict grading prompt

Temperature `0.1`. Same 4-pass structure as the speaking examiner prompt:

1. **Pass 1 — Evidence collection.** For each of the 4 criteria, quote ≥ 3
   pieces of evidence from the transcript, labelled (+) / (−).
2. **Pass 2 — Tentative band + descriptor match.** Quote the exact descriptor
   phrase that fits.
3. **Pass 3 — Self-challenge.** "Does the evidence genuinely meet every
   requirement of band X, or is X−0.5 the honest mark?" Defaults DOWN on
   ambiguity.
4. **Pass 4 — Final bands + overall**. Rounded to nearest 0.5 (.25 rounds
   down, .75 rounds up).

The prompt includes the **public band descriptors 4–9 for all four criteria**:

- **Task Achievement** (T1) / **Task Response** (T2)
- **Coherence & Cohesion**
- **Lexical Resource**
- **Grammatical Range & Accuracy**

Word-count cap rule (per Cambridge public descriptors):
- T1 < 150 words OR T2 < 250 words → Task Achievement/Response capped at **Band 5.0**.
- The prompt is told the word count so it applies this cap mechanically.

Output structure mirrors speaking: student-facing section (bands table, what
you did well, what to work on, focus, target-band model answer), then a
literal `---EXAMINER-BREAKDOWN---` marker, then the evidence & self-challenge
passes. Caller splits on the marker and wraps the second half in `<details>`.

## 6. Timer

Advisory countdown from 20:00 (T1) or 40:00 (T2). Colour changes at 5:00
remaining (amber) and 1:00 (red). On zero it keeps counting up as "overtime"
and flags the elapsed time in the attempt record. Timer is paused once the
student starts the upload step.

## 7. History

`workHistory.js` renders a collapsible "Past attempts" block on `index.html`
and on each practice page. Each row shows date, question, overall band, and
expands to the full feedback markdown.

## 8. Shared infrastructure reused from `shared/` submodule

- Gemini API-key storage under `localStorage['gemini_api_key']` (shared key
  with the speaking app — configure once).
- Quota-exceeded banner + Telegram alert.
- Design tokens (colour palette, font stack, radii).

## 9. Out of scope for v1 (future iterations)

- General Training task variants (GT letter for T1).
- Maps / process diagrams for T1 (require SVG authoring).
- Combined-chart T1 questions (two charts per question).
- Reference content (writing templates, vocabulary lists, model-essay library).
- Progress trends across attempts.
- User-uploaded chart images (bring-your-own practice book).
- Multi-device sync (currently 100% localStorage).

## 10. Success criteria

- A student can complete a full T1 or T2 attempt end-to-end within 25 or 45
  minutes respectively, from question-pick to final bands.
- OCR correctly reads 95%+ of tokens on clean handwriting; transcript gate
  catches the rest.
- Gemini grading returns bands within ±0.5 of a human IELTS examiner on a
  calibration set of known-band sample essays.
- API-key config is one-time and shared with the speaking app.
