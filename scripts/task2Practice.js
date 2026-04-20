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
