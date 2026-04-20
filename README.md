# IELTS Writing Practice (Academic)

Companion app to [ielts-speaking](https://github.com/nmnhut-it/ielts-speaking)
for Academic Task 1 and Task 2 writing practice with strict AI grading.

## The flow

1. Pick a Task 1 question (chart rendered with Chart.js) or Task 2 essay prompt.
2. Timer starts — 20 min for T1, 40 min for T2 (advisory, never auto-submits).
3. Write your answer on paper by hand.
4. Upload photos of your handwritten answer (up to 4 images).
5. Gemini transcribes the handwriting; you verify / edit the transcript.
6. Strict 4-pass grading against the official IELTS Writing band descriptors
   (Task Achievement, Coherence & Cohesion, Lexical Resource, Grammatical Range & Accuracy).
7. Student-facing feedback on top, collapsible examiner breakdown below.

## Status

Pre-implementation — see `docs/superpowers/specs/` for the design doc and
implementation plan.

## Stack

Static HTML + vanilla JS + CSS. Chart.js via CDN. Google GenAI SDK via CDN.
Shared infrastructure (Gemini wrapper, telegram quota banner, design tokens)
via the `shared/` submodule — shared with the speaking app.
