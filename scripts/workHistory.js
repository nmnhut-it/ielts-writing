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
