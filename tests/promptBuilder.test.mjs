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

test('both prompts include Inline corrections section with track-changes tokens', () => {
    const p1 = buildT1Prompt({ question: 'Q', transcript: 't', wordCount: 160, chartDataText: 'd' });
    const p2 = buildT2Prompt({ question: 'Q', transcript: 't', wordCount: 260, essayType: 'opinion' });
    [p1, p2].forEach(p => {
        assert.ok(p.includes('## Inline corrections'), 'missing Inline corrections heading');
        assert.ok(p.includes('⟪del:'), 'missing ⟪del: token example');
        assert.ok(p.includes('⟪ins:'), 'missing ⟪ins: token example');
    });
});
