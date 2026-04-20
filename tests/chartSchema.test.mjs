import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validateChart } = require('../scripts/utils/chartSchema.js');

test('accepts minimal bar chart', () => {
    const chart = {
        id: 't1-bar-001', type: 'bar', title: 'X', prompt: 'Describe.',
        categories: ['A', 'B'], series: [{ name: 'S', values: [1, 2] }]
    };
    const result = validateChart(chart);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
});

test('rejects unknown chart type', () => {
    const chart = { id: 'x', type: 'radar', title: 'X', prompt: 'P', categories: [], series: [] };
    const result = validateChart(chart);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('type')));
});

test('rejects series values count mismatch with categories', () => {
    const chart = {
        id: 'x', type: 'bar', title: 'X', prompt: 'P',
        categories: ['A', 'B', 'C'], series: [{ name: 'S', values: [1, 2] }]
    };
    const result = validateChart(chart);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('values')));
});

test('pie chart does not require categories/axis', () => {
    const chart = {
        id: 'p', type: 'pie', title: 'X', prompt: 'P',
        series: [{ name: 'Food', values: [40] }, { name: 'Rent', values: [60] }]
    };
    assert.equal(validateChart(chart).valid, true);
});

test('table type is valid with rows/columns', () => {
    const chart = {
        id: 't', type: 'table', title: 'X', prompt: 'P',
        columns: ['Year', 'Sales'], rows: [['2020', 100], ['2021', 120]]
    };
    assert.equal(validateChart(chart).valid, true);
});
