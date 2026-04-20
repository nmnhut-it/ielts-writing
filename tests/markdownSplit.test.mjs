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
