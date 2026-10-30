// Desde la raíz: node --experimental-vm-modules web/tests/charts.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SourceTextModule } from 'node:vm';
const cache = new Map();
async function load(path) {
  path = resolve(path);
  if (cache.has(path)) return cache.get(path);
  const module = new SourceTextModule(await readFile(path, 'utf8'), {
    identifier: path, initializeImportMeta(meta) { meta.url = pathToFileURL(path).href; },
  });
  cache.set(path, module);
  await module.link((specifier, parent) => load(resolve(dirname(parent.identifier), specifier)));
  await module.evaluate();
  return module;
}
const { normalizeMart, schemas } = (await load('web/js/data.js')).namespace;
const { createFilterState } = (await load('web/js/filter-state.js')).namespace;
const { buildSummaryCharts } = (await load('web/js/chart-data.js')).namespace;
const { chartConfiguration, initializeSummaryCharts } = (await load('web/js/summary-charts.js')).namespace;
const results = {};
for (const name of Object.keys(schemas)) results[name] = {
  status: 'fulfilled', value: normalizeMart(await readFile(`dw/mart_${name}.csv`, 'utf8'), name),
};
const store = createFilterState();
let charts = buildSummaryCharts(results, store.get());
assert.equal(charts['sales-daily'].values.reduce((a, b) => a + (b ?? 0), 0), 382410636);
assert.equal(charts['sales-daily'].labels[0], '01/01/2024');
assert.equal(charts['sales-daily'].labels.at(-1), '30/09/2025');
assert.equal(charts.nps.values[0], null); // NPS no tiene respuestas el 1 de enero.
assert.ok(charts.nps.values.filter(value => value !== null).every(value => value >= -100 && value <= 100));
assert.deepEqual([...charts['sales-province'].values].sort((a, b) => b - a), charts['sales-province'].values);
store.set('resumen', 'year', '2025');
store.set('resumen', 'month', '09');
store.set('resumen', 'channel', 'ONLINE');
charts = buildSummaryCharts(results, store.get());
assert.equal(charts.nps.labels.length, 30);
assert.equal(charts.nps.labels[0], '01/09/2025');
const day = 20250901;
const sales = results.sales.value.filter(row => row.date_id === day && row.channel_code === 'ONLINE');
assert.equal(charts['sales-daily'].values[0], sales.reduce((sum, row) => sum + row.total_sales, 0) / 100);
const web = results.web_activity.value.filter(row => row.date_id === day);
assert.equal(charts['users-daily'].values[0], new Set(web.filter(row => row.customer_id !== null).map(row => row.customer_id)).size + web.reduce((sum, row) => sum + row.anonymous_sessions, 0));
const nps = results.nps.value.filter(row => row.date_id === day && row.channel_code === 'ONLINE');
const total = nps.reduce((sum, row) => sum + row.total_responses, 0);
assert.equal(charts.nps.values[0], total ? 100 * nps.reduce((sum, row) => sum + row.promoters - row.detractors, 0) / total : null);
const before = charts;
store.set('resumen', 'province', 'Córdoba');
charts = buildSummaryCharts(results, store.get());
assert.deepEqual(charts['sales-province'], before['sales-province']);
assert.deepEqual(charts['users-daily'], before['users-daily']);
assert.deepEqual(charts.nps, before.nps);
assert.notDeepEqual(charts['sales-daily'], before['sales-daily']);
store.set('resumen', 'channel', 'OFFLINE');
assert.deepEqual(buildSummaryCharts(results, store.get())['users-daily'], charts['users-daily']);
const offlineNps = buildSummaryCharts(results, store.get()).nps;
const isolated = offlineNps.labels.filter((_, i) => offlineNps.values[i] !== null &&
  (i === 0 || offlineNps.values[i - 1] === null) &&
  (i === offlineNps.values.length - 1 || offlineNps.values[i + 1] === null));
assert.deepEqual(isolated, ['03/09/2025', '12/09/2025', '15/09/2025', '25/09/2025']);
const offlineConfig = chartConfiguration('nps', offlineNps);
assert.ok(offlineConfig.data.datasets[0].pointRadius > 0);
assert.equal(offlineConfig.data.datasets[0].spanGaps, false);
assert.ok(offlineConfig.data.datasets[0].data.some(value => value === null));
assert.equal(offlineConfig.options.scales.y.min, -100);
assert.equal(offlineConfig.options.scales.y.max, 100);
store.set('resumen', 'year', '1900');
assert.ok(Object.values(buildSummaryCharts(results, store.get())).every(series => series.values.length === 0));
store.reset('resumen');
const failed = buildSummaryCharts({ ...results, nps: { status: 'rejected', reason: new Error('404') } }, store.get());
assert.equal(failed.nps.error, '404');
const config = chartConfiguration('nps', charts.nps);
assert.equal(config.options.scales.y.min, -100);
assert.equal(config.options.scales.y.max, 100);
assert.equal(config.data.datasets[0].spanGaps, false);
assert.equal(chartConfiguration('sales-province', charts['sales-province']).options.indexAxis, 'y');

// Prueba de ciclo de vida del controlador, sin emular el renderizado de canvas.
function element() {
  return { hidden: false, classList: { add() {} }, setAttribute() {},
    children: [], append(child) { this.children.push(child); }, replaceChildren(...children) { this.children = children; },
  };
}
const containers = Object.fromEntries(['sales-daily', 'sales-province', 'users-daily', 'nps'].map(key => [key, element()]));
let constructed = 0, updated = 0, resized = 0, destroyed = 0;
globalThis.Chart = class {
  constructor(canvas, config) { this.data = config.data; constructed++; }
  update() { updated++; }
  resize() { resized++; }
  destroy() { destroyed++; }
};
globalThis.document = {
  querySelector(selector) { return containers[selector.match(/data-chart="([^"]+)"/)[1]]; },
  createElement: element,
  head: { append(script) { assert.match(script.src, /chart.js@4\.4\.8/); script.onload(); } },
  getElementById() { return { hidden: false }; },
};
const events = new Map();
globalThis.window = { addEventListener(name, listener) { events.set(name, listener); }, removeEventListener(name) { events.delete(name); } };
globalThis.requestAnimationFrame = fn => fn();
const dispose = await initializeSummaryCharts(results, store);
assert.equal(constructed, 4);
store.set('resumen', 'month', '09');
store.set('resumen', 'province', 'Mendoza');
assert.equal(constructed, 4);
assert.equal(updated, 8);
events.get('hashchange')();
assert.equal(resized, 4);
store.set('resumen', 'year', '1900');
assert.ok(Object.values(containers).every(container => container.children[0].textContent.includes('Sin datos') && !container.children[0].hidden));
store.reset('resumen');
assert.equal(constructed, 4);
dispose();
assert.equal(destroyed, 4);
assert.equal(events.size, 0);
console.log('OK: agregación diaria y provincial, filtros por alcance, fechas, huecos NPS, vacíos, errores y reutilización de cuatro instancias.');
