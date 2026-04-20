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
