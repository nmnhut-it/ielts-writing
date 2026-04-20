(function (global) {
    const CHART_TYPES = ['bar', 'line', 'pie', 'table'];

    function validateChart(chart) {
        const errors = [];
        if (!chart || typeof chart !== 'object') return { valid: false, errors: ['chart must be an object'] };
        if (!chart.id) errors.push('missing id');
        if (!chart.title) errors.push('missing title');
        if (!chart.prompt) errors.push('missing prompt');
        if (!CHART_TYPES.includes(chart.type)) errors.push('invalid type — must be one of ' + CHART_TYPES.join(', '));

        if (chart.type === 'table') {
            if (!Array.isArray(chart.columns) || chart.columns.length === 0) errors.push('table requires columns');
            if (!Array.isArray(chart.rows) || chart.rows.length === 0) errors.push('table requires rows');
        } else if (chart.type === 'pie') {
            if (!Array.isArray(chart.series) || chart.series.length === 0) errors.push('pie requires series');
        } else {
            if (!Array.isArray(chart.categories) || chart.categories.length === 0) errors.push('requires categories');
            if (!Array.isArray(chart.series) || chart.series.length === 0) errors.push('requires series');
            if (Array.isArray(chart.categories) && Array.isArray(chart.series)) {
                chart.series.forEach((s, i) => {
                    if (!Array.isArray(s.values) || s.values.length !== chart.categories.length) {
                        errors.push('series[' + i + '] values length must equal categories length');
                    }
                });
            }
        }
        return { valid: errors.length === 0, errors };
    }

    const api = { validateChart, CHART_TYPES };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else global.WritingUtils = Object.assign(global.WritingUtils || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
