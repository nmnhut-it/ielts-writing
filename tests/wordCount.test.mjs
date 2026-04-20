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
    assert.equal(countWords(text), 36);
});
