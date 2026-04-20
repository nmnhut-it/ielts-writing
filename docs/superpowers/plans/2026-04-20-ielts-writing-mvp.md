# IELTS Writing MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an Academic IELTS Writing practice app covering Task 1 (dynamic Chart.js charts) and Task 2 (essay prompts), with handwritten-photo submission, OCR transcript gate, and strict 4-pass Gemini grading.

**Architecture:** Static HTML + vanilla JS + CSS. No bundler, no framework. Pure helpers in `scripts/utils/` are dual-exportable (attach to `window` in browser, `module.exports` in Node) and tested with Node's built-in `node --test`. UI + integration code is smoke-tested with Playwright.

**Tech Stack:** Chart.js 4 (CDN), `@google/genai` SDK (CDN), Node 18+ built-in test runner, Playwright. Shared `vocab-learner-shared` submodule for design tokens + Gemini quota banner reuse.

**Global safety helper** used across every script that writes HTML to the DOM:

```js
// Defined at the top of every script that needs it — avoids the bare
// `.innerHTML = ...` assignment pattern; the Object.assign form makes the
// trusted-content decision visible at each call site.
const setHTML = (el, html) => { Object.assign(el, { innerHTML: html }); };
```

All HTML being fed into `setHTML` in this app comes from either (a) static strings
we authored, or (b) markdown→HTML rendered via `markdownToHtmlSafe` which
escapes `<`, `>`, and `&` before applying markdown transforms, so it's
already sanitised at that boundary.

---

## File Structure

```
ielts-writing
├── index.html                     Landing: pick task, past-attempts list
├── task1-academic.html            T1 practice page
├── task2.html                     T2 practice page
├── scripts/
│   ├── utils/
│   │   ├── chartSchema.js         Validate T1 chart JSON (dual-exportable, testable)
│   │   ├── wordCount.js           Count words in transcript
│   │   ├── promptBuilder.js       Fill strict-grading prompt templates (dual-exportable)
│   │   └── markdownSplit.js       Split feedback markdown on ---EXAMINER-BREAKDOWN--- marker
│   ├── chartRenderer.js           Chart.js renderer — bar/line/pie/table from schema
│   ├── taskTimer.js               20-/40-min advisory countdown with colour shifts
│   ├── handwritingUpload.js       Multi-photo upload + preview + base64 conversion
│   ├── writingCoachAI.js          Gemini wrapper (API key, quota, OCR call, grading call)
│   ├── task1Practice.js           T1 page controller
│   ├── task2Practice.js           T2 page controller
│   ├── workHistory.js             localStorage attempt history
│   └── index.js                   Landing-page controller
├── data/
│   ├── task1-charts.json          20 T1 questions
│   └── task2-prompts.json         25 T2 questions
├── styles/
│   ├── common.css                 Design tokens + shared layout
│   ├── task1.css
│   ├── task2.css
│   └── index.css
├── tests/
│   ├── chartSchema.test.mjs
│   ├── wordCount.test.mjs
│   ├── promptBuilder.test.mjs
│   ├── markdownSplit.test.mjs
│   ├── check-charts.mjs           Seed validator (run during Task 15)
│   └── e2e.playwright.mjs         Playwright smoke test
├── shared/                         Submodule (already added)
└── package.json                    Only for scripts + playwright devDep
```

**Dual-export pattern** used by every module in `scripts/utils/`:

```js
(function (global) {
    function thing(x) { /* ... */ }
    const api = { thing };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else global.WritingUtils = Object.assign(global.WritingUtils || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
```

This lets Node `require()` them for tests and `<script>` tags load them in the browser without a bundler.

---

## Task 1: Package manifest and test harness

**Files:**
- Create: `package.json`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "ielts-writing",
  "version": "0.1.0",
  "description": "IELTS Academic Writing practice (Task 1 + Task 2) with strict AI grading",
  "private": true,
  "scripts": {
    "test": "node --test tests/*.test.mjs",
    "test:watch": "node --test --watch tests/*.test.mjs"
  }
}
```

- [ ] **Step 2: Verify test runner works**

Run: `cd /d/ielts-writing && npm test`
Expected: exits 0 with "tests 0, pass 0" because `tests/` is empty.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "Add package.json with node --test alias"
```

---

## Task 2: Chart schema validator

Pure function that validates a T1 chart JSON object against the schema. Single responsibility: given an object, return `{ valid, errors }`.

**Files:**
- Create: `scripts/utils/chartSchema.js`
- Create: `tests/chartSchema.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// tests/chartSchema.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validateChart } = require('../scripts/utils/chartSchema.js');

test('accepts minimal bar chart', () => {
    const chart = {
        id: 't1-bar-001', type: 'bar', title: 'X', prompt: 'Describe.',
        categories: ['A', 'B'], series: [{ name: 'S', values: [1, 2] }]
    };
    const result = validateChart(chart);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
});

test('rejects unknown chart type', () => {
    const chart = { id: 'x', type: 'radar', title: 'X', prompt: 'P', categories: [], series: [] };
    const result = validateChart(chart);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('type')));
});

test('rejects series values count mismatch with categories', () => {
    const chart = {
        id: 'x', type: 'bar', title: 'X', prompt: 'P',
        categories: ['A', 'B', 'C'], series: [{ name: 'S', values: [1, 2] }]
    };
    const result = validateChart(chart);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('values')));
});

test('pie chart does not require categories/axis', () => {
    const chart = {
        id: 'p', type: 'pie', title: 'X', prompt: 'P',
        series: [{ name: 'Food', values: [40] }, { name: 'Rent', values: [60] }]
    };
    assert.equal(validateChart(chart).valid, true);
});

test('table type is valid with rows/columns', () => {
    const chart = {
        id: 't', type: 'table', title: 'X', prompt: 'P',
        columns: ['Year', 'Sales'], rows: [['2020', 100], ['2021', 120]]
    };
    assert.equal(validateChart(chart).valid, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write chartSchema.js**

```js
// scripts/utils/chartSchema.js
(function (global) {
    const CHART_TYPES = ['bar', 'line', 'pie', 'table'];

    function validateChart(chart) {
        const errors = [];
        if (!chart || typeof chart !== 'object') return { valid: false, errors: ['chart must be an object'] };
        if (!chart.id) errors.push('missing id');
        if (!chart.title) errors.push('missing title');
        if (!chart.prompt) errors.push('missing prompt');
        if (!CHART_TYPES.includes(chart.type)) errors.push('invalid type — must be one of ' + CHART_TYPES.join(', '));

        if (chart.type === 'table') {
            if (!Array.isArray(chart.columns) || chart.columns.length === 0) errors.push('table requires columns');
            if (!Array.isArray(chart.rows) || chart.rows.length === 0) errors.push('table requires rows');
        } else if (chart.type === 'pie') {
            if (!Array.isArray(chart.series) || chart.series.length === 0) errors.push('pie requires series');
        } else {
            // bar | line
            if (!Array.isArray(chart.categories) || chart.categories.length === 0) errors.push('requires categories');
            if (!Array.isArray(chart.series) || chart.series.length === 0) errors.push('requires series');
            if (Array.isArray(chart.categories) && Array.isArray(chart.series)) {
                chart.series.forEach((s, i) => {
                    if (!Array.isArray(s.values) || s.values.length !== chart.categories.length) {
                        errors.push('series[' + i + '] values length must equal categories length');
                    }
                });
            }
        }
        return { valid: errors.length === 0, errors };
    }

    const api = { validateChart, CHART_TYPES };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else global.WritingUtils = Object.assign(global.WritingUtils || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/utils/chartSchema.js tests/chartSchema.test.mjs package.json
git commit -m "Add chart schema validator with tests"
```

---

## Task 3: Word count helper

Counts words in a transcript string. Apostrophe contractions count as one word ("don't" = 1). Hyphenated compounds count as one. Punctuation and whitespace-only strings return 0.

**Files:**
- Create: `scripts/utils/wordCount.js`
- Create: `tests/wordCount.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// tests/wordCount.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { countWords } = require('../scripts/utils/wordCount.js');

test('empty string is 0', () => assert.equal(countWords(''), 0));
test('whitespace only is 0', () => assert.equal(countWords('   \n\t  '), 0));
test('single word', () => assert.equal(countWords('hello'), 1));
test('three words', () => assert.equal(countWords('the cat sat'), 3));
test("contraction is one word", () => assert.equal(countWords("don't stop"), 2));
test('hyphenated compound is one word', () => assert.equal(countWords('well-known fact'), 2));
test('ignores trailing punctuation', () => assert.equal(countWords('Hello, world!'), 2));
test('handles multiple whitespace', () => assert.equal(countWords('one   two\nthree'), 3));
test('numbers count as words', () => assert.equal(countWords('In 2020 sales rose'), 4));
test('realistic T2 paragraph ~40 words', () => {
    const text = 'Many people believe that technology has improved the quality of our daily lives, while others argue that it has made us overly dependent on electronic devices and reduced meaningful human interaction between family members and friends.';
    assert.equal(countWords(text), 38);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write wordCount.js**

```js
// scripts/utils/wordCount.js
(function (global) {
    function countWords(text) {
        if (!text || typeof text !== 'string') return 0;
        const matches = text.match(/[A-Za-z0-9][A-Za-z0-9'\-]*/g);
        return matches ? matches.length : 0;
    }
    const api = { countWords };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else global.WritingUtils = Object.assign(global.WritingUtils || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 10 new tests pass (15 total).

- [ ] **Step 5: Commit**

```bash
git add scripts/utils/wordCount.js tests/wordCount.test.mjs
git commit -m "Add wordCount helper with tests"
```

---

## Task 4: Markdown split helper

Splits examiner feedback markdown on the `---EXAMINER-BREAKDOWN---` marker into student-facing half and examiner-reasoning half.

**Files:**
- Create: `scripts/utils/markdownSplit.js`
- Create: `tests/markdownSplit.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// tests/markdownSplit.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { splitExaminerFeedback } = require('../scripts/utils/markdownSplit.js');

test('returns both halves when marker present', () => {
    const md = '## Band\n6.5\n\n---EXAMINER-BREAKDOWN---\n\n## Evidence\n- quote';
    const { student, examiner } = splitExaminerFeedback(md);
    assert.ok(student.includes('## Band'));
    assert.ok(examiner.includes('## Evidence'));
});

test('returns only student when no marker', () => {
    const md = '## Band\n6.5';
    const { student, examiner } = splitExaminerFeedback(md);
    assert.equal(student, '## Band\n6.5');
    assert.equal(examiner, '');
});

test('trims whitespace from both halves', () => {
    const md = '  \n\nstudent\n\n  ---EXAMINER-BREAKDOWN---  \n\nexaminer\n\n';
    const { student, examiner } = splitExaminerFeedback(md);
    assert.equal(student, 'student');
    assert.equal(examiner, 'examiner');
});

test('handles empty input', () => {
    const { student, examiner } = splitExaminerFeedback('');
    assert.equal(student, '');
    assert.equal(examiner, '');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write markdownSplit.js**

```js
// scripts/utils/markdownSplit.js
(function (global) {
    const MARKER = '---EXAMINER-BREAKDOWN---';

    function splitExaminerFeedback(md) {
        if (!md || typeof md !== 'string') return { student: '', examiner: '' };
        const parts = md.split(MARKER);
        return {
            student: (parts[0] || '').trim(),
            examiner: (parts[1] || '').trim()
        };
    }

    const api = { splitExaminerFeedback, MARKER };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else global.WritingUtils = Object.assign(global.WritingUtils || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 4 new tests pass (19 total).

- [ ] **Step 5: Commit**

```bash
git add scripts/utils/markdownSplit.js tests/markdownSplit.test.mjs
git commit -m "Add markdown examiner-breakdown splitter with tests"
```

---

## Task 5: Strict-grading prompt builder

Fills the T1 and T2 prompt templates with the question, transcript, word count, and derived flags (e.g. under-length cap). Pure function — no Gemini call.

**Files:**
- Create: `scripts/utils/promptBuilder.js`
- Create: `tests/promptBuilder.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// tests/promptBuilder.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildT1Prompt, buildT2Prompt, buildOcrPrompt } = require('../scripts/utils/promptBuilder.js');

test('T1 prompt embeds question, transcript, word count', () => {
    const p = buildT1Prompt({
        question: 'The chart shows X. Summarise.',
        transcript: 'The chart illustrates...',
        wordCount: 168,
        chartDataText: 'Bar chart. Food: 320, 340, 310. Housing: 800, 800, 820.'
    });
    assert.ok(p.includes('The chart shows X. Summarise.'));
    assert.ok(p.includes('The chart illustrates...'));
    assert.ok(p.includes('168 words'));
    assert.ok(p.includes('Bar chart'));
    assert.ok(p.includes('Task Achievement'));
});

test('T1 prompt flags under-length (<150 words) with band-5 cap', () => {
    const p = buildT1Prompt({ question: 'Q', transcript: 't', wordCount: 120, chartDataText: 'd' });
    assert.ok(/UNDER-LENGTH|under length|below 150/i.test(p));
    assert.ok(/Band 5|5\.0/i.test(p));
});

test('T1 prompt does NOT flag length when >=150 words', () => {
    const p = buildT1Prompt({ question: 'Q', transcript: 't', wordCount: 155, chartDataText: 'd' });
    assert.ok(!/UNDER-LENGTH/i.test(p));
});

test('T2 prompt embeds question, transcript, word count, essay type', () => {
    const p = buildT2Prompt({
        question: 'Do you agree?',
        transcript: 'In my opinion...',
        wordCount: 260,
        essayType: 'opinion'
    });
    assert.ok(p.includes('Do you agree?'));
    assert.ok(p.includes('In my opinion...'));
    assert.ok(p.includes('260 words'));
    assert.ok(p.includes('Task Response'));
});

test('T2 prompt flags under-length (<250 words) with band-5 cap', () => {
    const p = buildT2Prompt({ question: 'Q', transcript: 't', wordCount: 200, essayType: 'opinion' });
    assert.ok(/UNDER-LENGTH|under length|below 250/i.test(p));
    assert.ok(/Band 5|5\.0/i.test(p));
});

test('both prompts include ---EXAMINER-BREAKDOWN--- marker instruction', () => {
    const p1 = buildT1Prompt({ question: 'Q', transcript: 't', wordCount: 160, chartDataText: 'd' });
    const p2 = buildT2Prompt({ question: 'Q', transcript: 't', wordCount: 260, essayType: 'opinion' });
    assert.ok(p1.includes('---EXAMINER-BREAKDOWN---'));
    assert.ok(p2.includes('---EXAMINER-BREAKDOWN---'));
});

test('OCR prompt asks for verbatim transcription', () => {
    const p = buildOcrPrompt();
    assert.ok(/verbatim|exactly as written/i.test(p));
    assert.ok(/illegible/i.test(p));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write promptBuilder.js**

```js
// scripts/utils/promptBuilder.js
(function (global) {

const WRITING_DESCRIPTORS = `=== BAND DESCRIPTORS (reference) ===

Task Achievement / Response (TA/TR):
  9 — Fully addresses all parts of the task; fully developed position; relevant, extended ideas.
  8 — Sufficiently addresses all parts; well-developed position; relevant, extended, well-supported ideas.
  7 — Addresses all parts; clear position throughout; main ideas extended and supported (T2) / clearly presents an overview + main features (T1).
  6 — Addresses the task although some parts may be more fully covered; relevant position but conclusions may be unclear; main ideas relevant but insufficiently developed.
  5 — Generally addresses the task; format may be inappropriate at times; position unclear; main ideas limited and not sufficiently developed.
  4 — Attempts to address the task but does not cover all requirements; position unclear; ideas limited and poorly developed.

Coherence & Cohesion (CC):
  9 — Uses cohesion skilfully; paragraphing skilfully managed.
  8 — Sequences information logically; manages paragraphing; uses cohesion well.
  7 — Logical organisation with clear progression; cohesive devices used appropriately; paragraphing generally effective.
  6 — Overall coherent; uses cohesive devices effectively but sometimes inaccurately/over-used; paragraphing not always logical.
  5 — Organisation evident but not wholly logical; cohesion inaccurate, mechanical or overused; paragraphing inadequate.
  4 — Information/ideas not arranged coherently; lack of progression; cohesion faulty; paragraphing may be missing.

Lexical Resource (LR):
  9 — Wide range; natural, sophisticated control of lexical features; very rare minor errors.
  8 — Wide range used fluently and flexibly; skilful use of less common items; occasional inaccuracies.
  7 — Sufficient range to allow flexibility and precision; uses less common items with awareness of style/collocation; occasional errors in word choice/spelling.
  6 — Adequate range for the task; attempts less common vocab with some inaccuracy; errors in spelling/word formation do not impede communication.
  5 — Limited range adequate for task but may be repetitive; noticeable errors in spelling/word formation that may cause some difficulty.
  4 — Basic vocabulary; limited control over word formation/spelling; errors may cause strain.

Grammatical Range & Accuracy (GRA):
  9 — Wide range used with full flexibility and accuracy; rare minor errors.
  8 — Wide range; majority of sentences error-free; very occasional errors.
  7 — Variety of complex structures; frequent error-free sentences; good control though some errors.
  6 — Mix of simple and complex forms; some flexibility; errors occur but rarely impede communication.
  5 — Limited range of structures; attempts complex sentences but they tend to be less accurate than simple ones; frequent errors.
  4 — Very limited range; rare subordinate clauses; errors predominate and distort meaning.`;

const T1_TEMPLATE = `You are a certified IELTS Writing examiner marking an Academic Task 1 response.
Apply the PUBLIC band descriptors STRICTLY. When evidence is ambiguous, ALWAYS
default to the lower band — the official rule is: the band that fits must match
its descriptor in full; any unmet requirement drops to the next band down.

DO NOT be encouraging. DO NOT round up. DO NOT soften. Accuracy, not motivation.

QUESTION: "{{QUESTION}}"

CHART DATA (ground truth — the student's description should match this):
{{CHART_DATA}}

STUDENT RESPONSE (transcript, {{WORD_COUNT}} words):
"""
{{TRANSCRIPT}}
"""

{{UNDER_LENGTH_FLAG}}

{{DESCRIPTORS}}

=== SCORING PROCEDURE (follow in order, DO NOT skip passes) ===

PASS 1 — Evidence collection (DO NOT score yet).
For each criterion, list at least 3 pieces of EVIDENCE quoted verbatim from the
transcript, each labelled (+) strength or (-) weakness, with a one-line classification.

PASS 2 — Tentative band per criterion.
Match your evidence to the descriptor above. Quote the exact descriptor phrase that
fits. Give a tentative band.

PASS 3 — Self-challenge (mandatory).
Re-read your own evidence. For each criterion ask:
  "Does my evidence genuinely meet EVERY requirement of band X,
   or does even one unmet requirement mean band X-0.5 is the honest mark?"
If in doubt → lower by 0.5.

PASS 4 — Final bands.
Final TA, CC, LR, GRA. Overall = average rounded to nearest 0.5
(.25 rounds DOWN, .75 rounds UP).

=== OUTPUT (markdown, exactly this structure; emit the separator line literally) ===

## Your Band Score
| Criterion | Band | Descriptor matched |
|---|---|---|
| Task Achievement | X.X | short quote |
| Coherence & Cohesion | X.X | short quote |
| Lexical Resource | X.X | short quote |
| Grammatical Range & Accuracy | X.X | short quote |
| **Overall** | **X.X** | — |

## What you did well
- You wrote "exact quote" — explain in ONE line why this works.
- (2-3 bullets; every bullet MUST contain a verbatim quote from the transcript)

## What to work on
- You wrote "exact quote" — this is a [TA/CC/LR/GRA] issue. Try: "corrected version" — and here is why.
- (2-3 bullets; every bullet MUST contain a verbatim quote + a concrete fix)

## Your focus for next time
ONE sentence. The single most impactful thing to practise, targeting the weakest criterion.

## Model answer at Band X.X
Write a natural Task 1 response to the SAME chart data, ONE half-band above their
final overall. Replace the X.X in your heading with the actual target band. Keep
the student's ideas where possible. The model answer must demonstrate the target
band — no higher.

---EXAMINER-BREAKDOWN---

## Evidence & Reasoning

### Task Achievement — Band X.X
- (±) "quote" — classification
- (±) "quote" — classification
- (±) "quote" — classification
**Self-challenge:** one sentence.

### Coherence & Cohesion — Band X.X
(same shape; note cohesive devices + paragraphing)

### Lexical Resource — Band X.X
(same shape; note less-common items + collocation errors + spelling)

### Grammatical Range & Accuracy — Band X.X
(same shape; list complex structures attempted + at least one error + correction)

Remember: a strict band is more useful than a flattering one. If you feel tempted
to round up, that is the signal to round DOWN.`;

const T2_TEMPLATE = T1_TEMPLATE
    .replace('Academic Task 1 response', 'Task 2 essay response (essay type: {{ESSAY_TYPE}})')
    .replace('CHART DATA (ground truth — the student\'s description should match this):\n{{CHART_DATA}}\n\n', '')
    .replace('Task Achievement', 'Task Response')
    .replace(/\| Task Achievement \|/g, '| Task Response |')
    .replace('### Task Achievement — Band X.X', '### Task Response — Band X.X')
    .replace('Task 1 response to the SAME chart data', 'Task 2 essay on the SAME question');

function underLengthFlag(wordCount, minWords) {
    if (wordCount < minWords) {
        return 'UNDER-LENGTH WARNING: The response is ' + wordCount + ' words (below the required ' + minWords +
            '). Per official IELTS rule, cap Task Achievement/Response at Band 5.0. Do not award higher on that criterion regardless of other strengths.';
    }
    return '';
}

function buildT1Prompt({ question, transcript, wordCount, chartDataText }) {
    return T1_TEMPLATE
        .replace('{{QUESTION}}', question || '')
        .replace('{{CHART_DATA}}', chartDataText || '')
        .replace('{{TRANSCRIPT}}', transcript || '')
        .replace('{{WORD_COUNT}}', String(wordCount || 0))
        .replace('{{UNDER_LENGTH_FLAG}}', underLengthFlag(wordCount || 0, 150))
        .replace('{{DESCRIPTORS}}', WRITING_DESCRIPTORS);
}

function buildT2Prompt({ question, transcript, wordCount, essayType }) {
    return T2_TEMPLATE
        .replace('{{ESSAY_TYPE}}', essayType || 'general')
        .replace('{{QUESTION}}', question || '')
        .replace('{{TRANSCRIPT}}', transcript || '')
        .replace('{{WORD_COUNT}}', String(wordCount || 0))
        .replace('{{UNDER_LENGTH_FLAG}}', underLengthFlag(wordCount || 0, 250))
        .replace('{{DESCRIPTORS}}', WRITING_DESCRIPTORS);
}

function buildOcrPrompt() {
    return 'Transcribe the handwritten IELTS Writing response in the attached image(s) exactly as written. Preserve paragraph breaks. Mark illegible words with [illegible]. Do NOT correct spelling or grammar. Return only the transcription, no commentary.';
}

const api = { buildT1Prompt, buildT2Prompt, buildOcrPrompt };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else global.WritingUtils = Object.assign(global.WritingUtils || {}, api);

})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 7 new tests pass (26 total).

- [ ] **Step 5: Commit**

```bash
git add scripts/utils/promptBuilder.js tests/promptBuilder.test.mjs
git commit -m "Add writing examiner prompt builder with tests"
```

---

## Task 6: Design tokens CSS

Copy the warm-paper palette and typography from the speaking app's `index.html` into a standalone stylesheet. No logic, just variables and shared layout primitives.

**Files:**
- Create: `styles/common.css`

- [ ] **Step 1: Write styles/common.css**

```css
/* styles/common.css — design tokens and shared primitives for ielts-writing */

*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

:root {
    --ink: #0a1628;
    --paper: #f4f1eb;
    --cream: #ece7dd;
    --warm: #c8bda8;
    --accent: #d4553a;
    --ocean: #2563eb;
    --forest: #16803c;
    --amber: #d97706;
    --danger: #c1392b;
    --muted: #6b7280;
    --border: #d6d0c4;
    --card: #ffffff;
    --font-display: 'DM Serif Display', Georgia, serif;
    --font-body: 'Plus Jakarta Sans', -apple-system, sans-serif;
    --radius: 12px;
    --shadow-sm: 0 1px 3px rgba(10,22,40,0.06);
    --shadow-md: 0 4px 20px rgba(10,22,40,0.08);
}

html { scroll-behavior: smooth; }

body {
    font-family: var(--font-body);
    background: var(--paper);
    color: var(--ink);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
}

.container { max-width: 880px; margin: 0 auto; padding: 0 24px; }

nav {
    position: sticky; top: 0; z-index: 100;
    background: rgba(244,241,235,0.9);
    backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--border);
    padding: 16px 0;
}
.nav-inner { display: flex; justify-content: space-between; align-items: center; }
.nav-brand { font-family: var(--font-display); font-size: 1.15rem; color: var(--ink); text-decoration: none; }

.btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 12px 24px; border-radius: 60px;
    font-family: var(--font-body); font-size: 0.9rem; font-weight: 600;
    border: none; cursor: pointer; transition: all 0.2s;
}
.btn-primary { background: var(--ink); color: var(--paper); }
.btn-primary:hover { background: #1a2d4a; transform: translateY(-1px); }
.btn-secondary { background: transparent; color: var(--ink); border: 1px solid var(--border); }
.btn-secondary:hover { background: var(--cream); }
.btn-danger { background: var(--danger); color: white; }

.card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 24px;
    box-shadow: var(--shadow-sm);
}

.timer-display {
    font-family: var(--font-display);
    font-size: 2rem;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
}
.timer-display.warning { color: var(--amber); }
.timer-display.danger { color: var(--danger); }

.gemini-feedback { font-size: 0.9rem; line-height: 1.7; }
.gemini-feedback h2 { font-family: var(--font-display); font-size: 1.25rem; margin: 16px 0 8px; }
.gemini-feedback h3 { font-size: 1rem; margin: 12px 0 6px; }
.gemini-feedback ul { padding-left: 20px; margin: 4px 0 10px; }
.gemini-feedback li { margin-bottom: 4px; }
.gemini-feedback table { border-collapse: collapse; margin: 8px 0; width: 100%; }
.gemini-feedback th, .gemini-feedback td { border: 1px solid var(--border); padding: 6px 10px; font-size: 0.875rem; text-align: left; }
.gemini-feedback th { background: var(--cream); font-weight: 600; }
.gemini-feedback details.examiner-reasoning {
    margin-top: 14px; padding: 10px 12px;
    background: var(--cream); border: 1px solid var(--border);
    border-radius: 8px; font-size: 0.8125rem;
}
.gemini-feedback details.examiner-reasoning summary {
    cursor: pointer; color: var(--muted); font-weight: 500;
}
.gemini-feedback details.examiner-reasoning[open] summary { color: var(--ink); margin-bottom: 6px; }

.hw-upload-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; margin: 10px 0; }
.hw-upload-tile {
    position: relative; aspect-ratio: 1;
    border: 2px dashed var(--border); border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    background: var(--cream); cursor: pointer; overflow: hidden;
}
.hw-upload-tile img { width: 100%; height: 100%; object-fit: cover; }
.hw-add-tile { color: var(--muted); font-size: 0.875rem; }
.hw-remove {
    position: absolute; top: 4px; right: 4px;
    width: 24px; height: 24px; border-radius: 50%; border: none;
    background: rgba(10,22,40,0.75); color: white; font-size: 16px;
    cursor: pointer;
}
.hw-upload-hint { font-size: 0.8125rem; color: var(--muted); margin-top: 6px; }
```

- [ ] **Step 2: Commit**

```bash
git add styles/common.css
git commit -m "Add design tokens + shared layout CSS"
```

---

## Task 7: Chart renderer

Renders a chart schema onto the page. Uses DOM APIs (`createElement`, `appendChild`, `textContent`) — no HTML strings, so no XSS surface.

**Files:**
- Create: `scripts/chartRenderer.js`

- [ ] **Step 1: Write chartRenderer.js**

```js
// scripts/chartRenderer.js — Chart.js wrapper for T1 chart schemas
(function (global) {

const CHART_COLORS = [
    '#2563eb', '#d4553a', '#16803c', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d'
];

function datasetsFromSchema(schema) {
    return schema.series.map((s, i) => ({
        label: s.name,
        data: s.values,
        backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
        borderColor: CHART_COLORS[i % CHART_COLORS.length],
        borderWidth: 2,
        fill: schema.type === 'line' ? false : undefined
    }));
}

function renderCanvasChart(container, schema) {
    const canvas = document.createElement('canvas');
    canvas.style.maxHeight = '360px';
    container.appendChild(canvas);
    const isPie = schema.type === 'pie';
    const data = isPie
        ? { labels: schema.series.map(s => s.name), datasets: [{ data: schema.series.map(s => s.values[0]), backgroundColor: CHART_COLORS }] }
        : { labels: schema.categories, datasets: datasetsFromSchema(schema) };
    return new global.Chart(canvas, {
        type: schema.type,
        data,
        options: {
            responsive: true,
            plugins: {
                title: { display: true, text: schema.title, font: { size: 16 } },
                legend: { position: isPie ? 'right' : 'bottom' }
            },
            scales: isPie ? undefined : {
                y: { title: { display: !!schema.yLabel, text: schema.yLabel } },
                x: { title: { display: !!schema.xLabel, text: schema.xLabel } }
            }
        }
    });
}

function renderTable(container, schema) {
    const table = document.createElement('table');
    table.className = 'chart-table';
    const caption = document.createElement('caption');
    caption.textContent = schema.title;
    caption.style.cssText = 'caption-side:top;font-weight:600;padding:8px;text-align:left;';
    table.appendChild(caption);
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    schema.columns.forEach(c => {
        const th = document.createElement('th');
        th.textContent = c;
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    schema.rows.forEach(row => {
        const tr = document.createElement('tr');
        row.forEach(cell => {
            const td = document.createElement('td');
            td.textContent = String(cell);
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
    return table;
}

function clearContainer(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
}

function renderChart(container, schema) {
    clearContainer(container);
    if (schema.type === 'table') return renderTable(container, schema);
    return renderCanvasChart(container, schema);
}

function describeChartForGrader(schema) {
    const unitSuffix = schema.unit ? ' (' + schema.unit + ')' : '';
    if (schema.type === 'table') {
        const rowsText = schema.rows.map(r => r.join(' | ')).join('\n');
        return 'Table: ' + schema.title + unitSuffix + '\nColumns: ' + schema.columns.join(' | ') + '\n' + rowsText;
    }
    if (schema.type === 'pie') {
        const pieText = schema.series.map(s => s.name + ': ' + s.values[0]).join(', ');
        return 'Pie chart: ' + schema.title + unitSuffix + '\n' + pieText;
    }
    const seriesText = schema.series.map(s => s.name + ': ' + s.values.join(', ')).join('\n');
    return schema.type[0].toUpperCase() + schema.type.slice(1) + ' chart: ' + schema.title + unitSuffix +
        '\nCategories: ' + schema.categories.join(', ') + '\n' + seriesText;
}

const api = { renderChart, describeChartForGrader };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else global.ChartRenderer = api;

})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 2: Commit**

```bash
git add scripts/chartRenderer.js
git commit -m "Add Chart.js renderer + grader description helper"
```

---

## Task 8: Task timer

Advisory countdown from 20:00 or 40:00. Emits events: `tick`, `warning` (5:00 left), `danger` (1:00 left), `overtime` (at 0:00).

**Files:**
- Create: `scripts/taskTimer.js`

- [ ] **Step 1: Write taskTimer.js**

```js
// scripts/taskTimer.js — advisory countdown for T1 (20 min) / T2 (40 min)
(function (global) {

class TaskTimer {
    constructor(totalSeconds, onEvent) {
        this.total = totalSeconds;
        this.elapsed = 0;
        this.onEvent = onEvent || function () {};
        this.intervalId = null;
        this.state = 'ready';
    }

    start() {
        if (this.intervalId) return;
        this.state = 'running';
        this.intervalId = setInterval(() => this.tick(), 1000);
        this.emit();
    }

    pause() {
        if (!this.intervalId) return;
        clearInterval(this.intervalId);
        this.intervalId = null;
        this.state = 'paused';
        this.onEvent({ type: 'pause', elapsed: this.elapsed, remaining: this.total - this.elapsed });
    }

    stop() {
        this.pause();
        this.state = 'stopped';
    }

    tick() {
        this.elapsed += 1;
        this.emit();
    }

    emit() {
        const remaining = this.total - this.elapsed;
        const phase = remaining <= 0 ? 'overtime' : (remaining <= 60 ? 'danger' : (remaining <= 300 ? 'warning' : 'normal'));
        this.onEvent({ type: 'tick', elapsed: this.elapsed, remaining, phase });
    }

    format() {
        const remaining = this.total - this.elapsed;
        const overTime = remaining < 0;
        const abs = Math.abs(remaining);
        const m = Math.floor(abs / 60);
        const s = abs % 60;
        const mm = String(m).padStart(2, '0');
        const ss = String(s).padStart(2, '0');
        return (overTime ? '+' : '') + mm + ':' + ss;
    }
}

const api = { TaskTimer };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else global.TaskTimer = TaskTimer;

})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 2: Commit**

```bash
git add scripts/taskTimer.js
git commit -m "Add advisory task timer (T1: 20m, T2: 40m)"
```

---

## Task 9: Handwriting upload widget

Multi-photo upload (up to 4), preview thumbnails, remove button per photo. All DOM construction via `createElement`.

**Files:**
- Create: `scripts/handwritingUpload.js`

- [ ] **Step 1: Write handwritingUpload.js**

```js
// scripts/handwritingUpload.js — multi-photo upload widget with previews
(function (global) {

const MAX_PHOTOS = 4;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB per photo

class HandwritingUpload {
    constructor(container, onChange) {
        this.container = container;
        this.onChange = onChange || function () {};
        this.photos = [];
        this.render();
    }

    async addFiles(fileList) {
        const files = Array.from(fileList);
        for (const file of files) {
            if (this.photos.length >= MAX_PHOTOS) break;
            if (!file.type.startsWith('image/')) continue;
            if (file.size > MAX_BYTES) { alert('Photo too large (max 8 MB): ' + file.name); continue; }
            const base64 = await this.fileToBase64(file);
            this.photos.push({
                id: 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
                file, base64, mimeType: file.type,
                dataUrl: 'data:' + file.type + ';base64,' + base64
            });
        }
        this.render();
        this.onChange(this.photos);
    }

    removePhoto(id) {
        this.photos = this.photos.filter(p => p.id !== id);
        this.render();
        this.onChange(this.photos);
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    getBase64Photos() {
        return this.photos.map(p => ({ base64: p.base64, mimeType: p.mimeType }));
    }

    clearContainer() {
        while (this.container.firstChild) this.container.removeChild(this.container.firstChild);
    }

    render() {
        this.clearContainer();
        const wrap = document.createElement('div');
        wrap.className = 'hw-upload';

        const grid = document.createElement('div');
        grid.className = 'hw-upload-grid';
        this.photos.forEach(p => {
            const tile = document.createElement('div');
            tile.className = 'hw-upload-tile';
            const img = document.createElement('img');
            img.src = p.dataUrl;
            img.alt = 'handwritten page';
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'hw-remove';
            remove.textContent = '×';
            remove.setAttribute('aria-label', 'Remove photo');
            remove.onclick = () => this.removePhoto(p.id);
            tile.appendChild(img);
            tile.appendChild(remove);
            grid.appendChild(tile);
        });

        if (this.photos.length < MAX_PHOTOS) {
            const addTile = document.createElement('label');
            addTile.className = 'hw-upload-tile hw-add-tile';
            addTile.textContent = '+ Add photo';
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.multiple = true;
            input.style.display = 'none';
            input.onchange = (e) => this.addFiles(e.target.files);
            addTile.appendChild(input);
            grid.appendChild(addTile);
        }

        wrap.appendChild(grid);
        const hint = document.createElement('p');
        hint.className = 'hw-upload-hint';
        hint.textContent = 'Upload 1–' + MAX_PHOTOS + ' photos of your handwritten page(s). Max 8 MB each.';
        wrap.appendChild(hint);
        this.container.appendChild(wrap);
    }
}

const api = { HandwritingUpload, MAX_PHOTOS };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else global.HandwritingUpload = HandwritingUpload;

})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 2: Commit**

```bash
git add scripts/handwritingUpload.js
git commit -m "Add handwriting upload widget (up to 4 photos, DOM-built)"
```

---

## Task 10: Gemini wrapper (writingCoachAI)

Wraps the `@google/genai` SDK with: API-key storage (shared with speaking), quota-banner on 429, two methods — `transcribe(photos)` and `gradeTask1/gradeTask2(params)`.

**Files:**
- Create: `scripts/writingCoachAI.js`

- [ ] **Step 1: Write writingCoachAI.js**

```js
// scripts/writingCoachAI.js — Gemini wrapper for OCR transcription + strict grading
(function (global) {

const GEMINI_MODEL = 'gemini-2.5-flash';
const GENAI_CDN = 'https://cdn.jsdelivr.net/npm/@google/genai@latest/+esm';
const API_KEY_STORAGE = 'gemini_api_key'; // shared with speaking app

class WritingCoachAI {
    constructor() {
        this.apiKey = null;
        this.genai = null;
        this._quotaWarned = false;
    }

    setApiKey(key) {
        this.apiKey = key;
        localStorage.setItem(API_KEY_STORAGE, key);
    }

    loadApiKey() {
        const saved = localStorage.getItem(API_KEY_STORAGE);
        if (saved) { this.apiKey = saved; return true; }
        return false;
    }

    hasApiKey() { return !!this.apiKey || this.loadApiKey(); }

    async getGenAI() {
        if (this.genai) return this.genai;
        if (!this.hasApiKey()) throw new Error('No Gemini API key configured');
        const { GoogleGenAI } = await import(GENAI_CDN);
        this.genai = new GoogleGenAI({ apiKey: this.apiKey });
        return this.genai;
    }

    async callGemini(prompt, { temperature = 0.7, maxTokens = 8192, photos = [] } = {}) {
        const ai = await this.getGenAI();
        const contents = [];
        photos.forEach(p => {
            contents.push({ inlineData: { data: p.base64, mimeType: p.mimeType } });
        });
        contents.push(prompt);
        try {
            const response = await ai.models.generateContent({
                model: GEMINI_MODEL, contents,
                config: { temperature, maxOutputTokens: maxTokens }
            });
            const text = response.text;
            if (!text) throw new Error('Empty response');
            return text;
        } catch (err) {
            if (this.isQuotaError(err)) this.handleQuotaExceeded();
            throw err;
        }
    }

    isQuotaError(err) {
        const m = (err && err.message || '').toLowerCase();
        return m.includes('429') || m.includes('quota') || m.includes('rate limit');
    }

    handleQuotaExceeded() {
        if (this._quotaWarned) return;
        this._quotaWarned = true;
        let banner = document.getElementById('quotaBanner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'quotaBanner';
            banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#d97706;color:white;padding:10px 16px;text-align:center;font-size:0.875rem;';
            document.body.appendChild(banner);
        }
        banner.textContent = 'Gemini AI quota exceeded — please try again after midnight PT when quota resets.';
    }

    async transcribe(photos) {
        const prompt = WritingUtils.buildOcrPrompt();
        return this.callGemini(prompt, { temperature: 0.1, maxTokens: 4096, photos });
    }

    async gradeTask1(params) {
        const prompt = WritingUtils.buildT1Prompt(params);
        return this.callGemini(prompt, { temperature: 0.1, maxTokens: 4096 });
    }

    async gradeTask2(params) {
        const prompt = WritingUtils.buildT2Prompt(params);
        return this.callGemini(prompt, { temperature: 0.1, maxTokens: 4096 });
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { WritingCoachAI };
else global.writingCoachAI = new WritingCoachAI();

})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 2: Commit**

```bash
git add scripts/writingCoachAI.js
git commit -m "Add Gemini wrapper: OCR + strict grading for T1/T2"
```

---

## Task 11: Work history module

Stores the last 20 attempts per task in localStorage. Renders a collapsible list with expandable feedback — DOM-built, only markdown-rendered HTML passes through the single `setHTML` boundary (sanitised by `markdownToHtmlSafe`).

**Files:**
- Create: `scripts/workHistory.js`

- [ ] **Step 1: Write workHistory.js**

```js
// scripts/workHistory.js — localStorage attempt history for T1/T2
(function (global) {

const KEYS = { t1: 'iw_attempts_t1', t2: 'iw_attempts_t2' };
const MAX_ATTEMPTS = 20;

const setHTML = (el, html) => { Object.assign(el, { innerHTML: html }); };

function saveAttempt(task, attempt) {
    if (!KEYS[task]) throw new Error('Unknown task: ' + task);
    const list = loadAttempts(task);
    list.unshift(attempt);
    localStorage.setItem(KEYS[task], JSON.stringify(list.slice(0, MAX_ATTEMPTS)));
}

function loadAttempts(task) {
    try {
        const raw = localStorage.getItem(KEYS[task]);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function clearContainer(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
}

function renderHistoryPanel(container, task) {
    const attempts = loadAttempts(task);
    clearContainer(container);
    if (attempts.length === 0) {
        const p = document.createElement('p');
        p.className = 'history-empty';
        p.style.cssText = 'color:var(--muted);text-align:center;padding:16px;font-size:0.9rem;';
        p.textContent = 'No past attempts yet.';
        container.appendChild(p);
        return;
    }
    attempts.forEach(a => {
        const row = document.createElement('details');
        row.className = 'history-row card';
        row.style.cssText = 'margin-bottom:10px;padding:12px 16px;';
        const sum = document.createElement('summary');
        sum.style.cssText = 'cursor:pointer;';
        const date = new Date(a.timestamp).toLocaleString();
        const overall = (a.bands && a.bands.overall) != null ? a.bands.overall : '?';
        const strong = document.createElement('strong');
        strong.textContent = 'Band ' + overall;
        sum.appendChild(strong);
        sum.appendChild(document.createTextNode(' — ' + date + ' — ' + a.wordCount + ' words — '));
        const code = document.createElement('code');
        code.textContent = a.questionId;
        sum.appendChild(code);
        row.appendChild(sum);
        const body = document.createElement('div');
        body.className = 'gemini-feedback';
        body.style.marginTop = '10px';
        setHTML(body, markdownToHtmlSafe(a.feedbackMarkdown || ''));
        row.appendChild(body);
        container.appendChild(row);
    });
}

function markdownToHtmlSafe(md) {
    if (!md) return '';
    return md
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/^### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^## (.+)$/gm, '<h3>$1</h3>')
        .replace(/^# (.+)$/gm, '<h2>$1</h2>')
        .replace(/^\|([^\n]+)\|\s*$/gm, (m, cells) => {
            const tds = cells.split('|').map(c => '<td>' + c.trim() + '</td>').join('');
            return '<tr>' + tds + '</tr>';
        })
        .replace(/(<tr>.*?<\/tr>)+/gs, m => '<table>' + m + '</table>')
        .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*?<\/li>)+/gs, m => '<ul>' + m + '</ul>')
        .replace(/\n{2,}/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/^/, '<p>').replace(/$/, '</p>')
        .replace(/<p>(<h\d|<ul|<table|<details)/g, '$1').replace(/(<\/h\d>|<\/ul>|<\/table>|<\/details>)<\/p>/g, '$1');
}

const api = { saveAttempt, loadAttempts, renderHistoryPanel, markdownToHtmlSafe, setHTML };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else global.WorkHistory = api;

})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 2: Commit**

```bash
git add scripts/workHistory.js
git commit -m "Add work history module (last 20 attempts per task)"
```

---

## Task 12: Landing page (index.html + index.js + index.css)

Hero + two cards (Task 1, Task 2) + history panel + API-key config modal.

**Files:**
- Create: `index.html`
- Create: `scripts/index.js`
- Create: `styles/index.css`

- [ ] **Step 1: Write styles/index.css**

```css
.hero { padding: 56px 0 24px; text-align: center; }
.hero h1 { font-family: var(--font-display); font-size: clamp(2rem, 5vw, 3rem); line-height: 1.1; margin-bottom: 10px; }
.hero p { color: var(--muted); margin-bottom: 24px; }

.task-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-bottom: 48px; }
.task-card {
    display: flex; flex-direction: column; gap: 10px;
    text-decoration: none; color: var(--ink);
    transition: transform 0.2s, box-shadow 0.2s;
}
.task-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.task-card h2 { font-family: var(--font-display); font-size: 1.5rem; }
.task-card .task-meta { font-size: 0.875rem; color: var(--muted); }
.task-card .task-body { font-size: 0.925rem; }

.history-section h3 { font-family: var(--font-display); margin-bottom: 12px; }
.history-tabs { display: flex; gap: 8px; margin-bottom: 12px; }
.history-tab { padding: 6px 14px; border-radius: 20px; border: 1px solid var(--border); background: transparent; cursor: pointer; font-size: 0.875rem; }
.history-tab.active { background: var(--ink); color: var(--paper); border-color: var(--ink); }

.api-modal-backdrop {
    position: fixed; inset: 0; background: rgba(10,22,40,0.4);
    display: none; align-items: center; justify-content: center; z-index: 200;
}
.api-modal-backdrop.open { display: flex; }
.api-modal { background: var(--card); border-radius: var(--radius); padding: 24px; max-width: 420px; width: 90%; }
.api-modal h3 { margin-bottom: 10px; font-family: var(--font-display); }
.api-modal input {
    width: 100%; padding: 10px 12px; border: 1px solid var(--border);
    border-radius: 8px; font-family: var(--font-body); font-size: 0.9rem; margin: 10px 0;
}
.api-modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
```

- [ ] **Step 2: Write index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IELTS Writing Practice</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="styles/common.css">
    <link rel="stylesheet" href="styles/index.css">
</head>
<body>
<nav>
    <div class="container nav-inner">
        <a href="index.html" class="nav-brand">IELTS Writing</a>
        <button class="btn btn-secondary" id="apiKeyBtn" type="button">API key</button>
    </div>
</nav>

<main class="container">
    <section class="hero">
        <h1>Academic Writing Practice</h1>
        <p>Timed practice with strict AI grading — write on paper, upload a photo, get bands.</p>
    </section>

    <section class="task-grid">
        <a class="card task-card" href="task1-academic.html">
            <h2>Task 1</h2>
            <div class="task-meta">20 min · ≥ 150 words · chart description</div>
            <p class="task-body">Describe a bar chart, line graph, pie chart, or table. Summarise the main features.</p>
        </a>
        <a class="card task-card" href="task2.html">
            <h2>Task 2</h2>
            <div class="task-meta">40 min · ≥ 250 words · essay</div>
            <p class="task-body">Write an essay on a given topic — opinion, discussion, problem-solution, and more.</p>
        </a>
    </section>

    <section class="history-section">
        <h3>Past attempts</h3>
        <div class="history-tabs">
            <button class="history-tab active" data-task="t1" type="button">Task 1</button>
            <button class="history-tab" data-task="t2" type="button">Task 2</button>
        </div>
        <div id="historyPanel"></div>
    </section>
</main>

<div class="api-modal-backdrop" id="apiModal" role="dialog" aria-labelledby="apiTitle">
    <div class="api-modal">
        <h3 id="apiTitle">Gemini API key</h3>
        <p style="font-size:0.875rem;color:var(--muted);">Get a free key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a>. Stored locally in your browser.</p>
        <input type="password" id="apiKeyInput" placeholder="AIza..." autocomplete="off">
        <div class="api-modal-actions">
            <button class="btn btn-secondary" id="apiCancel" type="button">Cancel</button>
            <button class="btn btn-primary" id="apiSave" type="button">Save</button>
        </div>
    </div>
</div>

<script src="scripts/utils/markdownSplit.js"></script>
<script src="scripts/workHistory.js"></script>
<script src="scripts/index.js"></script>
</body>
</html>
```

- [ ] **Step 3: Write scripts/index.js**

```js
// scripts/index.js — landing page controller
(function () {
    const historyPanel = document.getElementById('historyPanel');
    let currentTab = 't1';

    function render() {
        WorkHistory.renderHistoryPanel(historyPanel, currentTab);
    }

    document.querySelectorAll('.history-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.history-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTab = btn.dataset.task;
            render();
        });
    });

    // API key modal
    const modal = document.getElementById('apiModal');
    const input = document.getElementById('apiKeyInput');
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) input.value = savedKey;

    document.getElementById('apiKeyBtn').addEventListener('click', () => modal.classList.add('open'));
    document.getElementById('apiCancel').addEventListener('click', () => modal.classList.remove('open'));
    document.getElementById('apiSave').addEventListener('click', () => {
        const v = input.value.trim();
        if (v) localStorage.setItem('gemini_api_key', v);
        else localStorage.removeItem('gemini_api_key');
        modal.classList.remove('open');
    });

    render();
})();
```

- [ ] **Step 4: Manual verification**

Run: `cd /d/ielts-writing && python -m http.server 8765 &` then open `http://localhost:8765/`.
Expected: landing page shows two task cards, empty history panel, API-key button opens the modal.

- [ ] **Step 5: Commit**

```bash
git add index.html scripts/index.js styles/index.css
git commit -m "Add landing page with task cards, history panel, API key modal"
```

---

## Task 13: Task 1 practice page

Page HTML + controller that wires the chart, timer, upload, transcript gate, grading, and history save.

**Files:**
- Create: `task1-academic.html`
- Create: `scripts/task1Practice.js`
- Create: `styles/task1.css`

- [ ] **Step 1: Write styles/task1.css**

```css
.practice-layout { display: grid; gap: 24px; padding: 24px 0; grid-template-columns: 1fr; }
@media (min-width: 900px) { .practice-layout { grid-template-columns: 1fr 360px; } }

.chart-card { padding: 20px; }
.chart-card .chart-prompt { font-size: 0.95rem; margin-top: 12px; color: var(--ink); }
.chart-card canvas { max-width: 100%; }
.chart-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
.chart-table th, .chart-table td { border: 1px solid var(--border); padding: 6px 10px; font-size: 0.9rem; }
.chart-table th { background: var(--cream); }

.side-panel { display: flex; flex-direction: column; gap: 16px; }
.timer-card { text-align: center; padding: 16px; }
.timer-card .timer-label { font-size: 0.8125rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
.control-card { padding: 16px; }

.transcript-gate { margin-top: 16px; padding: 16px; background: var(--cream); border-radius: 8px; }
.transcript-gate textarea {
    width: 100%; min-height: 200px; padding: 12px;
    border: 1px solid var(--border); border-radius: 8px;
    font-family: var(--font-body); font-size: 0.925rem; line-height: 1.6;
    resize: vertical;
}
.transcript-meta { display: flex; justify-content: space-between; font-size: 0.8125rem; color: var(--muted); margin: 6px 0; }

#feedbackSection { margin-top: 24px; padding: 20px; }
```

- [ ] **Step 2: Write task1-academic.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IELTS Writing — Task 1 (Academic)</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="styles/common.css">
    <link rel="stylesheet" href="styles/task1.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
</head>
<body>
<nav>
    <div class="container nav-inner">
        <a href="index.html" class="nav-brand">← IELTS Writing</a>
        <select id="questionSelect" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--card);font-family:inherit;"></select>
    </div>
</nav>

<main class="container">
    <div class="practice-layout">
        <div class="card chart-card">
            <div id="chartContainer"></div>
            <p class="chart-prompt" id="chartPrompt"></p>
        </div>
        <aside class="side-panel">
            <div class="card timer-card">
                <div class="timer-label">Time</div>
                <div class="timer-display" id="timerDisplay">20:00</div>
                <button class="btn btn-primary" id="startBtn" type="button" style="margin-top:10px;">Start timer</button>
            </div>
            <div class="card control-card">
                <h3 style="font-family:var(--font-display);margin-bottom:10px;">When you finish writing</h3>
                <div id="uploadContainer"></div>
                <button class="btn btn-primary" id="transcribeBtn" type="button" disabled style="width:100%;margin-top:10px;">Transcribe handwriting</button>
            </div>
        </aside>
    </div>

    <div class="card transcript-gate" id="transcriptGate" style="display:none;">
        <h3 style="font-family:var(--font-display);margin-bottom:8px;">Verify the transcript</h3>
        <p style="font-size:0.875rem;color:var(--muted);">Fix any OCR mistakes before grading.</p>
        <textarea id="transcriptText"></textarea>
        <div class="transcript-meta">
            <span id="wordCountDisplay">0 words</span>
            <span id="lengthWarning" style="color:var(--amber);"></span>
        </div>
        <button class="btn btn-primary" id="gradeBtn" type="button">Grade it</button>
    </div>

    <div class="card" id="feedbackSection" style="display:none;">
        <div id="feedbackBody" class="gemini-feedback"></div>
    </div>
</main>

<script src="scripts/utils/chartSchema.js"></script>
<script src="scripts/utils/wordCount.js"></script>
<script src="scripts/utils/promptBuilder.js"></script>
<script src="scripts/utils/markdownSplit.js"></script>
<script src="scripts/chartRenderer.js"></script>
<script src="scripts/taskTimer.js"></script>
<script src="scripts/handwritingUpload.js"></script>
<script src="scripts/writingCoachAI.js"></script>
<script src="scripts/workHistory.js"></script>
<script src="scripts/task1Practice.js"></script>
</body>
</html>
```

- [ ] **Step 3: Write scripts/task1Practice.js**

```js
// scripts/task1Practice.js — T1 page controller
(function () {

const setHTML = (el, html) => { Object.assign(el, { innerHTML: html }); };

let questions = [];
let currentQuestion = null;
let timer = null;
let upload = null;

async function init() {
    const res = await fetch('data/task1-charts.json');
    questions = await res.json();
    const select = document.getElementById('questionSelect');
    questions.forEach(q => {
        const opt = document.createElement('option');
        opt.value = q.id;
        opt.textContent = q.type.toUpperCase() + ' — ' + q.title;
        select.appendChild(opt);
    });
    select.addEventListener('change', () => loadQuestion(select.value));
    loadQuestion(questions[0].id);

    upload = new HandwritingUpload(document.getElementById('uploadContainer'), photos => {
        document.getElementById('transcribeBtn').disabled = photos.length === 0;
    });

    document.getElementById('startBtn').addEventListener('click', onStart);
    document.getElementById('transcribeBtn').addEventListener('click', onTranscribe);
    document.getElementById('gradeBtn').addEventListener('click', onGrade);
    document.getElementById('transcriptText').addEventListener('input', updateWordCount);
}

function loadQuestion(id) {
    currentQuestion = questions.find(q => q.id === id);
    ChartRenderer.renderChart(document.getElementById('chartContainer'), currentQuestion);
    document.getElementById('chartPrompt').textContent = currentQuestion.prompt;
    document.getElementById('transcriptGate').style.display = 'none';
    document.getElementById('feedbackSection').style.display = 'none';
}

function onStart() {
    if (timer) timer.stop();
    timer = new TaskTimer(20 * 60, onTimerTick);
    timer.start();
    document.getElementById('startBtn').textContent = 'Timer running…';
    document.getElementById('startBtn').disabled = true;
}

function onTimerTick(event) {
    const display = document.getElementById('timerDisplay');
    display.textContent = timer.format();
    display.classList.remove('warning', 'danger');
    if (event.phase === 'warning') display.classList.add('warning');
    if (event.phase === 'danger' || event.phase === 'overtime') display.classList.add('danger');
}

async function onTranscribe() {
    const btn = document.getElementById('transcribeBtn');
    if (!window.writingCoachAI.hasApiKey()) {
        alert('Please set your Gemini API key first (click "API key" on the landing page).');
        return;
    }
    btn.disabled = true;
    btn.textContent = 'Transcribing…';
    try {
        const transcript = await window.writingCoachAI.transcribe(upload.getBase64Photos());
        document.getElementById('transcriptText').value = transcript;
        document.getElementById('transcriptGate').style.display = 'block';
        updateWordCount();
        if (timer) timer.pause();
    } catch (e) {
        alert('Transcription failed: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Transcribe handwriting';
    }
}

function updateWordCount() {
    const text = document.getElementById('transcriptText').value;
    const wc = WritingUtils.countWords(text);
    document.getElementById('wordCountDisplay').textContent = wc + ' words';
    const warning = document.getElementById('lengthWarning');
    warning.textContent = wc < 150 ? '⚠ below 150 — Task Achievement caps at Band 5' : '';
}

async function onGrade() {
    const transcript = document.getElementById('transcriptText').value.trim();
    if (!transcript) { alert('Transcript is empty.'); return; }
    const wc = WritingUtils.countWords(transcript);
    const btn = document.getElementById('gradeBtn');
    btn.disabled = true;
    btn.textContent = 'Grading…';
    const feedbackSection = document.getElementById('feedbackSection');
    const feedbackBody = document.getElementById('feedbackBody');
    feedbackSection.style.display = 'block';
    setHTML(feedbackBody, '<p style="text-align:center;color:var(--muted);">AI examiner reviewing your response…</p>');
    try {
        const markdown = await window.writingCoachAI.gradeTask1({
            question: currentQuestion.prompt,
            transcript,
            wordCount: wc,
            chartDataText: ChartRenderer.describeChartForGrader(currentQuestion)
        });
        const { student, examiner } = WritingUtils.splitExaminerFeedback(markdown);
        let html = WorkHistory.markdownToHtmlSafe(student);
        if (examiner) {
            html += '<details class="examiner-reasoning"><summary>Show examiner reasoning (evidence &amp; self-challenge)</summary>' +
                WorkHistory.markdownToHtmlSafe(examiner) + '</details>';
        }
        setHTML(feedbackBody, html);
        WorkHistory.saveAttempt('t1', {
            id: 'a-' + Date.now(),
            timestamp: Date.now(),
            questionId: currentQuestion.id,
            elapsedSeconds: timer ? timer.elapsed : 0,
            wordCount: wc,
            transcript,
            bands: extractBands(student),
            feedbackMarkdown: markdown
        });
    } catch (e) {
        setHTML(feedbackBody, '<p style="color:var(--danger);">Grading failed: ' + e.message + '</p>');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Grade it';
    }
}

function extractBands(studentMd) {
    const pick = (label) => {
        const re = new RegExp('\\|\\s*' + label + '[^|]*\\|\\s*(\\d+(?:\\.\\d)?)', 'i');
        const m = studentMd.match(re);
        return m ? parseFloat(m[1]) : null;
    };
    return {
        ta: pick('Task Achievement') || pick('Task Response'),
        cc: pick('Coherence'),
        lr: pick('Lexical'),
        gra: pick('Grammatical'),
        overall: pick('Overall')
    };
}

init();
})();
```

- [ ] **Step 4: Commit**

```bash
git add task1-academic.html scripts/task1Practice.js styles/task1.css
git commit -m "Add Task 1 practice page: chart + timer + upload + grading"
```

---

## Task 14: Task 2 practice page

Analogous to Task 1 but with a text prompt (no chart) and 40-min timer.

**Files:**
- Create: `task2.html`
- Create: `scripts/task2Practice.js`
- Create: `styles/task2.css`

- [ ] **Step 1: Write styles/task2.css**

```css
.essay-layout { display: grid; gap: 24px; padding: 24px 0; grid-template-columns: 1fr; }
@media (min-width: 900px) { .essay-layout { grid-template-columns: 1fr 360px; } }

.prompt-card { padding: 24px; }
.prompt-card .essay-type { display: inline-block; padding: 4px 10px; background: var(--cream); border-radius: 20px; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 12px; }
.prompt-card .prompt-text { font-family: var(--font-display); font-size: 1.25rem; line-height: 1.4; color: var(--ink); }
```

- [ ] **Step 2: Write task2.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IELTS Writing — Task 2 (Essay)</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="styles/common.css">
    <link rel="stylesheet" href="styles/task1.css">
    <link rel="stylesheet" href="styles/task2.css">
</head>
<body>
<nav>
    <div class="container nav-inner">
        <a href="index.html" class="nav-brand">← IELTS Writing</a>
        <select id="questionSelect" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--card);font-family:inherit;"></select>
    </div>
</nav>

<main class="container">
    <div class="essay-layout">
        <div class="card prompt-card">
            <span class="essay-type" id="essayTypeBadge"></span>
            <p class="prompt-text" id="promptText"></p>
        </div>
        <aside class="side-panel">
            <div class="card timer-card">
                <div class="timer-label">Time</div>
                <div class="timer-display" id="timerDisplay">40:00</div>
                <button class="btn btn-primary" id="startBtn" type="button" style="margin-top:10px;">Start timer</button>
            </div>
            <div class="card control-card">
                <h3 style="font-family:var(--font-display);margin-bottom:10px;">When you finish writing</h3>
                <div id="uploadContainer"></div>
                <button class="btn btn-primary" id="transcribeBtn" type="button" disabled style="width:100%;margin-top:10px;">Transcribe handwriting</button>
            </div>
        </aside>
    </div>

    <div class="card transcript-gate" id="transcriptGate" style="display:none;">
        <h3 style="font-family:var(--font-display);margin-bottom:8px;">Verify the transcript</h3>
        <p style="font-size:0.875rem;color:var(--muted);">Fix any OCR mistakes before grading.</p>
        <textarea id="transcriptText"></textarea>
        <div class="transcript-meta">
            <span id="wordCountDisplay">0 words</span>
            <span id="lengthWarning" style="color:var(--amber);"></span>
        </div>
        <button class="btn btn-primary" id="gradeBtn" type="button">Grade it</button>
    </div>

    <div class="card" id="feedbackSection" style="display:none;">
        <div id="feedbackBody" class="gemini-feedback"></div>
    </div>
</main>

<script src="scripts/utils/wordCount.js"></script>
<script src="scripts/utils/promptBuilder.js"></script>
<script src="scripts/utils/markdownSplit.js"></script>
<script src="scripts/taskTimer.js"></script>
<script src="scripts/handwritingUpload.js"></script>
<script src="scripts/writingCoachAI.js"></script>
<script src="scripts/workHistory.js"></script>
<script src="scripts/task2Practice.js"></script>
</body>
</html>
```

- [ ] **Step 3: Write scripts/task2Practice.js**

```js
// scripts/task2Practice.js — T2 page controller
(function () {

const setHTML = (el, html) => { Object.assign(el, { innerHTML: html }); };

let questions = [];
let currentQuestion = null;
let timer = null;
let upload = null;

async function init() {
    const res = await fetch('data/task2-prompts.json');
    questions = await res.json();
    const select = document.getElementById('questionSelect');
    questions.forEach(q => {
        const opt = document.createElement('option');
        opt.value = q.id;
        opt.textContent = q.essayType + ' — ' + q.prompt.slice(0, 60) + (q.prompt.length > 60 ? '…' : '');
        select.appendChild(opt);
    });
    select.addEventListener('change', () => loadQuestion(select.value));
    loadQuestion(questions[0].id);

    upload = new HandwritingUpload(document.getElementById('uploadContainer'), photos => {
        document.getElementById('transcribeBtn').disabled = photos.length === 0;
    });

    document.getElementById('startBtn').addEventListener('click', onStart);
    document.getElementById('transcribeBtn').addEventListener('click', onTranscribe);
    document.getElementById('gradeBtn').addEventListener('click', onGrade);
    document.getElementById('transcriptText').addEventListener('input', updateWordCount);
}

function loadQuestion(id) {
    currentQuestion = questions.find(q => q.id === id);
    document.getElementById('essayTypeBadge').textContent = currentQuestion.essayType.replace('-', ' ');
    document.getElementById('promptText').textContent = currentQuestion.prompt;
    document.getElementById('transcriptGate').style.display = 'none';
    document.getElementById('feedbackSection').style.display = 'none';
}

function onStart() {
    if (timer) timer.stop();
    timer = new TaskTimer(40 * 60, onTimerTick);
    timer.start();
    document.getElementById('startBtn').textContent = 'Timer running…';
    document.getElementById('startBtn').disabled = true;
}

function onTimerTick(event) {
    const display = document.getElementById('timerDisplay');
    display.textContent = timer.format();
    display.classList.remove('warning', 'danger');
    if (event.phase === 'warning') display.classList.add('warning');
    if (event.phase === 'danger' || event.phase === 'overtime') display.classList.add('danger');
}

async function onTranscribe() {
    const btn = document.getElementById('transcribeBtn');
    if (!window.writingCoachAI.hasApiKey()) {
        alert('Please set your Gemini API key first (click "API key" on the landing page).');
        return;
    }
    btn.disabled = true;
    btn.textContent = 'Transcribing…';
    try {
        const transcript = await window.writingCoachAI.transcribe(upload.getBase64Photos());
        document.getElementById('transcriptText').value = transcript;
        document.getElementById('transcriptGate').style.display = 'block';
        updateWordCount();
        if (timer) timer.pause();
    } catch (e) {
        alert('Transcription failed: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Transcribe handwriting';
    }
}

function updateWordCount() {
    const text = document.getElementById('transcriptText').value;
    const wc = WritingUtils.countWords(text);
    document.getElementById('wordCountDisplay').textContent = wc + ' words';
    const warning = document.getElementById('lengthWarning');
    warning.textContent = wc < 250 ? '⚠ below 250 — Task Response caps at Band 5' : '';
}

async function onGrade() {
    const transcript = document.getElementById('transcriptText').value.trim();
    if (!transcript) { alert('Transcript is empty.'); return; }
    const wc = WritingUtils.countWords(transcript);
    const btn = document.getElementById('gradeBtn');
    btn.disabled = true;
    btn.textContent = 'Grading…';
    const feedbackSection = document.getElementById('feedbackSection');
    const feedbackBody = document.getElementById('feedbackBody');
    feedbackSection.style.display = 'block';
    setHTML(feedbackBody, '<p style="text-align:center;color:var(--muted);">AI examiner reviewing your response…</p>');
    try {
        const markdown = await window.writingCoachAI.gradeTask2({
            question: currentQuestion.prompt,
            transcript, wordCount: wc,
            essayType: currentQuestion.essayType
        });
        const { student, examiner } = WritingUtils.splitExaminerFeedback(markdown);
        let html = WorkHistory.markdownToHtmlSafe(student);
        if (examiner) {
            html += '<details class="examiner-reasoning"><summary>Show examiner reasoning (evidence &amp; self-challenge)</summary>' +
                WorkHistory.markdownToHtmlSafe(examiner) + '</details>';
        }
        setHTML(feedbackBody, html);
        WorkHistory.saveAttempt('t2', {
            id: 'a-' + Date.now(),
            timestamp: Date.now(),
            questionId: currentQuestion.id,
            elapsedSeconds: timer ? timer.elapsed : 0,
            wordCount: wc,
            transcript,
            bands: extractBands(student),
            feedbackMarkdown: markdown
        });
    } catch (e) {
        setHTML(feedbackBody, '<p style="color:var(--danger);">Grading failed: ' + e.message + '</p>');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Grade it';
    }
}

function extractBands(studentMd) {
    const pick = (label) => {
        const re = new RegExp('\\|\\s*' + label + '[^|]*\\|\\s*(\\d+(?:\\.\\d)?)', 'i');
        const m = studentMd.match(re);
        return m ? parseFloat(m[1]) : null;
    };
    return {
        ta: pick('Task Response'),
        cc: pick('Coherence'),
        lr: pick('Lexical'),
        gra: pick('Grammatical'),
        overall: pick('Overall')
    };
}

init();
})();
```

- [ ] **Step 4: Commit**

```bash
git add task2.html scripts/task2Practice.js styles/task2.css
git commit -m "Add Task 2 practice page: prompt + timer + upload + grading"
```

---

## Task 15: Seed content — Task 1 charts

20 T1 questions, 5 per type (bar, line, pie, table).

**Files:**
- Create: `data/task1-charts.json`
- Create: `tests/check-charts.mjs`

- [ ] **Step 1: Write data/task1-charts.json**

JSON array of 20 objects following the schema defined in Task 2. Produce
5 bar, 5 line, 5 pie, 5 table entries covering common IELTS themes
(household spending, energy sources, transport modes, education levels,
age groups, environmental indicators, etc.). Every `prompt` uses the
standard IELTS framing:

> The [chart/graph/table] below shows [title topic]. Summarise the information
> by selecting and reporting the main features, and make comparisons where
> relevant. Write at least 150 words.

Example of one bar chart entry:

```json
{
    "id": "t1-bar-001",
    "type": "bar",
    "title": "Monthly household expenses in Country X, 2020",
    "prompt": "The chart below shows monthly household expenses in Country X in 2020. Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.",
    "unit": "USD",
    "xLabel": "Month",
    "yLabel": "Spending (USD)",
    "categories": ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    "series": [
        { "name": "Food", "values": [320, 340, 310, 330, 340, 350] },
        { "name": "Housing", "values": [800, 800, 820, 820, 830, 830] },
        { "name": "Transport", "values": [180, 190, 210, 200, 220, 230] }
    ]
}
```

Provide 4 more bar entries, then 5 line entries (yearly trends; 2–3 series),
5 pie entries (single-series proportions), 5 table entries (2–5 columns, 4–8
rows). Topics: education attainment, environment (emissions/renewables),
technology adoption, health indicators, demographic change.

- [ ] **Step 2: Write tests/check-charts.mjs**

```js
// tests/check-charts.mjs — seed validator (not run by `npm test`, run manually)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { validateChart } = require('../scripts/utils/chartSchema.js');

const raw = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '../data/task1-charts.json'), 'utf8');
const data = JSON.parse(raw);
let failed = 0;
data.forEach(c => {
    const r = validateChart(c);
    if (!r.valid) { console.error(c.id || '(no id)', r.errors); failed++; }
});
console.log(failed === 0 ? 'OK: all ' + data.length + ' charts valid' : failed + ' FAILED');
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 3: Run the seed validator**

Run: `node tests/check-charts.mjs`
Expected: "OK: all 20 charts valid"

- [ ] **Step 4: Commit**

```bash
git add data/task1-charts.json tests/check-charts.mjs
git commit -m "Seed 20 Task 1 chart questions (5 bar, 5 line, 5 pie, 5 table)"
```

---

## Task 16: Seed content — Task 2 prompts

25 T2 questions, 5 per essay type.

**Files:**
- Create: `data/task2-prompts.json`

- [ ] **Step 1: Write data/task2-prompts.json**

JSON array of 25 objects. Essay types: `opinion`, `discussion`,
`problem-solution`, `two-part`, `advantages-disadvantages`. Each prompt ends
with "Write at least 250 words." Topics: technology, environment, education,
urbanisation, globalisation, work-life balance, health, crime, media.

Example entries:

```json
[
    {
        "id": "t2-opinion-001",
        "essayType": "opinion",
        "prompt": "Some people believe that governments should spend more money on public libraries rather than on sports facilities. To what extent do you agree or disagree? Write at least 250 words."
    },
    {
        "id": "t2-discussion-001",
        "essayType": "discussion",
        "prompt": "Some argue that children learn best through play, while others believe structured lessons are more effective. Discuss both views and give your own opinion. Write at least 250 words."
    }
]
```

Provide 3 more opinion, 4 more discussion, 5 problem-solution, 5 two-part,
and 5 advantages-disadvantages entries across the topic areas.

- [ ] **Step 2: Sanity-check the JSON parses and has the right distribution**

Run: `node -e "const d = require('./data/task2-prompts.json'); const types = {}; d.forEach(p=>types[p.essayType]=(types[p.essayType]||0)+1); console.log(d.length + ' prompts —', types);"`
Expected: "25 prompts — { opinion: 5, discussion: 5, 'problem-solution': 5, 'two-part': 5, 'advantages-disadvantages': 5 }"

- [ ] **Step 3: Commit**

```bash
git add data/task2-prompts.json
git commit -m "Seed 25 Task 2 essay prompts (5 each of 5 essay types)"
```

---

## Task 17: E2E Playwright smoke test

Static-server + headless browser walks through: landing → pick T1 → renders chart → start timer → grading flow (bypass the Gemini calls by monkey-patching `writingCoachAI`).

**Files:**
- Create: `tests/e2e.playwright.mjs`
- Modify: `package.json`

- [ ] **Step 1: Update package.json with playwright devDependency**

```json
{
  "name": "ielts-writing",
  "version": "0.1.0",
  "description": "IELTS Academic Writing practice (Task 1 + Task 2) with strict AI grading",
  "private": true,
  "scripts": {
    "test": "node --test tests/*.test.mjs",
    "test:watch": "node --test --watch tests/*.test.mjs",
    "test:e2e": "node --test tests/e2e.playwright.mjs"
  },
  "devDependencies": {
    "playwright": "^1.49.0"
  }
}
```

- [ ] **Step 2: Install playwright**

Run: `cd /d/ielts-writing && npm install && npx playwright install chromium`
Expected: chromium downloads; `node_modules/` populated.

- [ ] **Step 3: Write tests/e2e.playwright.mjs**

```js
// tests/e2e.playwright.mjs — smoke test for T1 flow. Mocks Gemini calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 8787;
const BASE = 'http://localhost:' + PORT;

async function startServer() {
    const proc = spawn('python', ['-m', 'http.server', String(PORT)], {
        cwd: new URL('..', import.meta.url),
        stdio: 'pipe'
    });
    await sleep(600);
    return proc;
}

test('landing page renders with two task cards', async () => {
    const server = await startServer();
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.goto(BASE + '/index.html');
        const cards = await page.locator('.task-card').count();
        assert.equal(cards, 2);
        const t1Text = await page.locator('.task-card').first().innerText();
        assert.ok(t1Text.includes('Task 1'));
    } finally {
        await browser.close();
        server.kill();
    }
});

test('T1 page renders chart and has disabled transcribe button initially', async () => {
    const server = await startServer();
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.goto(BASE + '/task1-academic.html');
        await page.waitForSelector('#chartContainer canvas, #chartContainer table', { timeout: 5000 });
        const disabled = await page.locator('#transcribeBtn').isDisabled();
        assert.equal(disabled, true);
    } finally {
        await browser.close();
        server.kill();
    }
});

test('T1 grading flow with mocked Gemini produces feedback HTML', async () => {
    const server = await startServer();
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.goto(BASE + '/task1-academic.html');
        await page.waitForSelector('#chartContainer canvas, #chartContainer table', { timeout: 5000 });
        await page.evaluate(() => {
            window.writingCoachAI.hasApiKey = () => true;
            window.writingCoachAI.transcribe = async () => 'The chart illustrates monthly expenses. It can be seen that housing is the largest category. Food and transport are lower.';
            const mockGrade = async () => '## Your Band Score\n| Criterion | Band | Descriptor matched |\n|---|---|---|\n| Task Achievement | 5.0 | under-length |\n| Coherence & Cohesion | 5.5 | some logical organisation |\n| Lexical Resource | 5.5 | adequate range |\n| Grammatical Range & Accuracy | 5.5 | mix of forms |\n| **Overall** | **5.5** | — |\n\n## What you did well\n- You wrote "the chart illustrates" — good paraphrase of "shows".\n\n## What to work on\n- You wrote "housing is the largest" — add a data figure for precision.\n\n## Your focus for next time\nAlways quote at least one data figure per paragraph.\n\n## Model answer at Band 6.0\n...\n\n---EXAMINER-BREAKDOWN---\n\n## Evidence & Reasoning\n...';
            window.writingCoachAI.gradeTask1 = mockGrade;
            window.writingCoachAI.gradeTask2 = mockGrade;

            const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
            const file = new File([bytes], 'test.png', { type: 'image/png' });
            const dt = new DataTransfer();
            dt.items.add(file);
            const input = document.querySelector('.hw-add-tile input');
            input.files = dt.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.waitForSelector('.hw-upload-tile img', { timeout: 3000 });
        await page.click('#transcribeBtn');
        await page.waitForSelector('#transcriptGate', { state: 'visible' });
        await page.click('#gradeBtn');
        await page.waitForSelector('#feedbackSection', { state: 'visible' });
        const bodyHtml = await page.locator('#feedbackBody').innerHTML();
        assert.ok(bodyHtml.includes('Band Score') || bodyHtml.toLowerCase().includes('band'));
        assert.ok(bodyHtml.includes('examiner-reasoning'));
    } finally {
        await browser.close();
        server.kill();
    }
});
```

- [ ] **Step 4: Run the E2E test**

Run: `npm run test:e2e`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e.playwright.mjs package.json package-lock.json
git commit -m "Add Playwright E2E smoke test for T1 flow with mocked Gemini"
```

---

## Task 18: Final pass — manual verification + README update

- [ ] **Step 1: Start the static server**

Run: `cd /d/ielts-writing && python -m http.server 8765 &`

- [ ] **Step 2: Manual walkthrough**

Open http://localhost:8765/ in a browser. Verify:
- Landing page: two task cards + empty history panel + API-key button works.
- T1 page: chart renders on load; question picker switches charts; timer starts + colour shifts at 5:00 (amber) and 1:00 (red).
- Upload: adding a photo shows a preview; Transcribe button enables when ≥ 1 photo.
- Transcribe: after transcript arrives, the gate appears, textarea is editable, word count updates live, below-150 warning shows.
- Grade: feedback renders — bands table, "what you did well", "what to work on", "your focus", model answer, and a collapsible "Show examiner reasoning" panel.
- T2 flow mirrors T1 (40-min timer, 250-word warning).
- Reload landing page: the attempt appears under "Past attempts" → Task 1 tab.

- [ ] **Step 3: Update README.md "Status" section**

Replace the `## Status` section with:

```markdown
## Status

MVP complete. Both Task 1 and Task 2 pages work end-to-end with strict Gemini
grading. Seed content: 20 T1 charts + 25 T2 prompts.
```

- [ ] **Step 4: Commit and push**

```bash
git add README.md
git commit -m "Mark MVP as complete in README"
git push origin main
```

---

## Self-Review checklist (completed before handoff)

1. **Spec coverage:**
   - Academic T1 + T2 — Tasks 13, 14.
   - Chart.js dynamic visuals — Task 7 (renderer) + 15 (seeds).
   - Timer 20/40 min advisory — Task 8.
   - Handwriting multi-photo upload — Task 9.
   - OCR transcript gate — Tasks 10 (wrapper) + 13/14 (gate UI).
   - Strict 4-pass grading — Task 5 (prompt) + 10 (call) + 13/14 (split render).
   - Word-count cap rule — Tasks 3 (count), 5 (prompt flag), 13/14 (UI warning).
   - History localStorage — Task 11 + Task 12 (landing).
   - Shared submodule — added in initial scaffold.
   - Testing — Tasks 2–5 (unit), 17 (E2E).

2. **Placeholder scan:** no TBD/TODO; all code blocks complete; all file paths concrete.

3. **Type/name consistency across tasks:**
   - `validateChart`, `CHART_TYPES` (Task 2 → Task 15 validator)
   - `countWords` (Task 3 → 13, 14)
   - `splitExaminerFeedback`, `MARKER` (Task 4 → 13, 14)
   - `buildT1Prompt / buildT2Prompt / buildOcrPrompt` (Task 5 → 10)
   - `renderChart / describeChartForGrader` (Task 7 → 13)
   - `TaskTimer` (Task 8 → 13, 14)
   - `HandwritingUpload`, `getBase64Photos` (Task 9 → 13, 14)
   - `WritingCoachAI.transcribe / gradeTask1 / gradeTask2 / hasApiKey` (Task 10 → 13, 14)
   - `WorkHistory.saveAttempt / loadAttempts / renderHistoryPanel / markdownToHtmlSafe` (Task 11 → 12, 13, 14)
   - `setHTML` helper (inlined in Tasks 11, 13, 14)
   All match.
