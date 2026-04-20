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
