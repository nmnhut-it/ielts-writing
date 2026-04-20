(function (global) {

const CHART_COLORS = [
    '#2563eb', '#d4553a', '#16803c', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d'
];

function datasetsFromSchema(schema) {
    return schema.series.map((s, i) => ({
        label: s.name,
        data: s.values,
        backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
        borderColor: CHART_COLORS[i % CHART_COLORS.length],
        borderWidth: 2,
        fill: schema.type === 'line' ? false : undefined
    }));
}

function renderCanvasChart(container, schema) {
    const canvas = document.createElement('canvas');
    canvas.style.maxHeight = '360px';
    container.appendChild(canvas);
    const isPie = schema.type === 'pie';
    const data = isPie
        ? { labels: schema.series.map(s => s.name), datasets: [{ data: schema.series.map(s => s.values[0]), backgroundColor: CHART_COLORS }] }
        : { labels: schema.categories, datasets: datasetsFromSchema(schema) };
    return new global.Chart(canvas, {
        type: schema.type,
        data,
        options: {
            responsive: true,
            plugins: {
                title: { display: true, text: schema.title, font: { size: 16 } },
                legend: { position: isPie ? 'right' : 'bottom' }
            },
            scales: isPie ? undefined : {
                y: { title: { display: !!schema.yLabel, text: schema.yLabel } },
                x: { title: { display: !!schema.xLabel, text: schema.xLabel } }
            }
        }
    });
}

function renderTable(container, schema) {
    const table = document.createElement('table');
    table.className = 'chart-table';
    const caption = document.createElement('caption');
    caption.textContent = schema.title;
    caption.style.cssText = 'caption-side:top;font-weight:600;padding:8px;text-align:left;';
    table.appendChild(caption);
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    schema.columns.forEach(c => {
        const th = document.createElement('th');
        th.textContent = c;
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    schema.rows.forEach(row => {
        const tr = document.createElement('tr');
        row.forEach(cell => {
            const td = document.createElement('td');
            td.textContent = String(cell);
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
    return table;
}

function clearContainer(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
}

function renderChart(container, schema) {
    clearContainer(container);
    if (schema.type === 'table') return renderTable(container, schema);
    return renderCanvasChart(container, schema);
}

function describeChartForGrader(schema) {
    const unitSuffix = schema.unit ? ' (' + schema.unit + ')' : '';
    if (schema.type === 'table') {
        const rowsText = schema.rows.map(r => r.join(' | ')).join('\n');
        return 'Table: ' + schema.title + unitSuffix + '\nColumns: ' + schema.columns.join(' | ') + '\n' + rowsText;
    }
    if (schema.type === 'pie') {
        const pieText = schema.series.map(s => s.name + ': ' + s.values[0]).join(', ');
        return 'Pie chart: ' + schema.title + unitSuffix + '\n' + pieText;
    }
    const seriesText = schema.series.map(s => s.name + ': ' + s.values.join(', ')).join('\n');
    return schema.type[0].toUpperCase() + schema.type.slice(1) + ' chart: ' + schema.title + unitSuffix +
        '\nCategories: ' + schema.categories.join(', ') + '\n' + seriesText;
}

const api = { renderChart, describeChartForGrader };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else global.ChartRenderer = api;

})(typeof window !== 'undefined' ? window : globalThis);
