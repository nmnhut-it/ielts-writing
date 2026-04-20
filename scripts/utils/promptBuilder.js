/**
 * promptBuilder.js — Builds strict IELTS Writing examiner prompts for Task 1, Task 2, and OCR.
 * Dual-export: CommonJS (Node/scripts) and browser global (window.WritingUtils).
 * Input: plain objects with question, transcript, wordCount, etc.
 * Output: string prompt ready to send to an AI examiner API.
 */
(function (global) {

    // Full public band descriptor text embedded so the AI has grounding in every call.
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

    // Shared scoring procedure and output format used by both Task 1 and Task 2 templates.
    const SCORING_PROCEDURE = `=== SCORING PROCEDURE (follow in order, DO NOT skip passes) ===

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
(.25 rounds DOWN, .75 rounds UP).`;

    // Shared output section used by both templates.
    const OUTPUT_FORMAT = `=== OUTPUT (markdown, exactly this structure; emit the separator line literally) ===

## Your Band Score
| Criterion | Band | Descriptor matched |
|---|---|---|
| {{TA_LABEL}} | X.X | short quote |
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
Write a natural {{TASK_LABEL}} response to the SAME {{TASK_SOURCE}}, ONE half-band above their
final overall. Replace the X.X in your heading with the actual target band. Keep
the student's ideas where possible. The model answer must demonstrate the target
band — no higher.

---EXAMINER-BREAKDOWN---

## Evidence & Reasoning

### {{TA_LABEL}} — Band X.X
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

    const UNDER_LENGTH_TEMPLATE =
        'UNDER-LENGTH WARNING: The response is {{WORD_COUNT}} words (below the required {{MIN_WORDS}}). ' +
        'Per official IELTS rule, cap {{TA_LABEL}} at Band 5.0. ' +
        'Do not award higher on that criterion regardless of other strengths.';

    /**
     * Builds the under-length warning or returns empty string.
     * @param {number} wordCount - actual word count
     * @param {number} minWords - minimum required (150 for T1, 250 for T2)
     * @param {string} taLabel - criterion label ('Task Achievement' or 'Task Response')
     * @returns {string}
     */
    function buildUnderLengthFlag(wordCount, minWords, taLabel) {
        if (wordCount < minWords) {
            return UNDER_LENGTH_TEMPLATE
                .replace('{{WORD_COUNT}}', String(wordCount))
                .replace('{{MIN_WORDS}}', String(minWords))
                .replace('{{TA_LABEL}}', taLabel);
        }
        return '';
    }

    /**
     * Fills shared placeholders (question, transcript, word count, under-length flag, descriptors).
     * @param {string} template
     * @param {object} opts
     * @returns {string}
     */
    function fillCommon(template, { question, transcript, wordCount, underLengthFlag }) {
        return template
            .replace('{{QUESTION}}', question || '')
            .replace('{{TRANSCRIPT}}', transcript || '')
            .replace('{{WORD_COUNT}}', String(wordCount || 0))
            .replace('{{UNDER_LENGTH_FLAG}}', underLengthFlag)
            .replace('{{DESCRIPTORS}}', WRITING_DESCRIPTORS);
    }

    /**
     * Builds an IELTS Task 1 (Academic) examiner prompt.
     * @param {{question: string, transcript: string, wordCount: number, chartDataText: string}} opts
     * @returns {string} Full prompt string
     */
    function buildT1Prompt({ question, transcript, wordCount, chartDataText }) {
        const taLabel = 'Task Achievement';
        const underLengthFlag = buildUnderLengthFlag(wordCount || 0, 150, taLabel);

        const outputSection = OUTPUT_FORMAT
            .replace(/\{\{TA_LABEL\}\}/g, taLabel)
            .replace('{{TASK_LABEL}}', 'Task 1')
            .replace('{{TASK_SOURCE}}', 'chart data');

        const template = [
            'You are a certified IELTS Writing examiner marking an Academic Task 1 response.',
            'Apply the PUBLIC band descriptors STRICTLY. When evidence is ambiguous, ALWAYS',
            'default to the lower band — the official rule is: the band that fits must match',
            'its descriptor in full; any unmet requirement drops to the next band down.',
            '',
            'DO NOT be encouraging. DO NOT round up. DO NOT soften. Accuracy, not motivation.',
            '',
            'QUESTION: "{{QUESTION}}"',
            '',
            'CHART DATA (ground truth — the student\'s description should match this):',
            '{{CHART_DATA}}',
            '',
            'STUDENT RESPONSE (transcript, {{WORD_COUNT}} words):',
            '"""',
            '{{TRANSCRIPT}}',
            '"""',
            '',
            '{{UNDER_LENGTH_FLAG}}',
            '',
            '{{DESCRIPTORS}}',
            '',
            SCORING_PROCEDURE,
            '',
            outputSection,
        ].join('\n');

        return fillCommon(
            template.replace('{{CHART_DATA}}', chartDataText || ''),
            { question, transcript, wordCount, underLengthFlag }
        );
    }

    /**
     * Builds an IELTS Task 2 examiner prompt.
     * @param {{question: string, transcript: string, wordCount: number, essayType: string}} opts
     * @returns {string} Full prompt string
     */
    function buildT2Prompt({ question, transcript, wordCount, essayType }) {
        const taLabel = 'Task Response';
        const underLengthFlag = buildUnderLengthFlag(wordCount || 0, 250, taLabel);

        const outputSection = OUTPUT_FORMAT
            .replace(/\{\{TA_LABEL\}\}/g, taLabel)
            .replace('{{TASK_LABEL}}', 'Task 2')
            .replace('{{TASK_SOURCE}}', 'question');

        const template = [
            'You are a certified IELTS Writing examiner marking a Task 2 essay response (essay type: {{ESSAY_TYPE}}).',
            'Apply the PUBLIC band descriptors STRICTLY. When evidence is ambiguous, ALWAYS',
            'default to the lower band — the official rule is: the band that fits must match',
            'its descriptor in full; any unmet requirement drops to the next band down.',
            '',
            'DO NOT be encouraging. DO NOT round up. DO NOT soften. Accuracy, not motivation.',
            '',
            'QUESTION: "{{QUESTION}}"',
            '',
            'STUDENT RESPONSE (transcript, {{WORD_COUNT}} words):',
            '"""',
            '{{TRANSCRIPT}}',
            '"""',
            '',
            '{{UNDER_LENGTH_FLAG}}',
            '',
            '{{DESCRIPTORS}}',
            '',
            SCORING_PROCEDURE,
            '',
            outputSection,
        ].join('\n');

        return fillCommon(
            template.replace('{{ESSAY_TYPE}}', essayType || 'general'),
            { question, transcript, wordCount, underLengthFlag }
        );
    }

    /**
     * Builds the OCR transcription prompt for handwritten IELTS responses.
     * @returns {string} Fixed OCR instruction string
     */
    function buildOcrPrompt() {
        return (
            'Transcribe the handwritten IELTS Writing response in the attached image(s) ' +
            'exactly as written. Preserve paragraph breaks. ' +
            'Mark illegible words with [illegible]. ' +
            'Do NOT correct spelling or grammar. ' +
            'Return only the verbatim transcription, no commentary.'
        );
    }

    const api = { buildT1Prompt, buildT2Prompt, buildOcrPrompt };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else global.WritingUtils = Object.assign(global.WritingUtils || {}, api);

})(typeof window !== 'undefined' ? window : globalThis);
