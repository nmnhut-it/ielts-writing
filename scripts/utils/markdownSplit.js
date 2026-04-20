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
