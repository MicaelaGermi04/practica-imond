// Desde la raíz: node --experimental-vm-modules web/tests/audit-fixes.test.mjs
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
const { normalizeMart, loadMart, retryFailedMarts, schemas, LOAD_TIMEOUT_MS } = (await load('web/js/data.js')).namespace;
const { parseCSV } = (await load('web/js/csv.js')).namespace;
const { createFilterState } = (await load('web/js/filter-state.js')).namespace;
const { filterMart } = (await load('web/js/filtering.js')).namespace;
const metrics = (await load('web/js/metrics.js')).namespace;
const { buildSummaryCharts } = (await load('web/js/chart-data.js')).namespace;
const { buildProductCharts } = (await load('web/js/product-chart-data.js')).namespace;
const { chartTableModel, initializeChartTables } = (await load('web/js/chart-tables.js')).namespace;
const { productChartConfiguration } = (await load('web/js/product-charts.js')).namespace;
const results = {}, sources = {};
for (const name of Object.keys(schemas)) {
  sources[name] = await readFile(`dw/mart_${name}.csv`, 'utf8');
  results[name] = { status: 'fulfilled', value: normalizeMart(sources[name], name) };
  const parsed = parseCSV(sources[name]);
  const row = parsed.headers.map(column => parsed.rows[0][column]).join(',');
  assert.throws(() => normalizeMart(`${parsed.headers.join(',')}\n${row}\n${row}`, name), /duplicada/);
}
// Duplicación de anónimos (null), y de identificadores con ceros a la izquierda.
const web = parseCSV(sources.web_activity);
const anonymous = web.rows.find(row => row.customer_id === '');
const anonCsv = web.headers.map(column => anonymous[column]).join(',');
assert.throws(() => normalizeMart(`${web.headers.join(',')}\n${anonCsv}\n${anonCsv}`, 'web_activity'), /duplicada/);
const nps = parseCSV(sources.nps);
const broken = { ...nps.rows[0], promoters: '9999' };
assert.throws(() => normalizeMart(`${nps.headers.join(',')}\n${nps.headers.map(column => broken[column]).join(',')}`, 'nps'), /total_responses/);
const sales = parseCSV(sources.sales);
const first = sales.rows[0];
const variant = { ...first, channel_id: `00${first.channel_id}` };
assert.throws(() => normalizeMart(`${sales.headers.join(',')}\n${sales.headers.map(c => first[c]).join(',')}\n${sales.headers.map(c => variant[c]).join(',')}`, 'sales'), /duplicada/);

assert.equal(LOAD_TIMEOUT_MS, 15000);
let signal;
globalThis.fetch = (url, options) => { signal = options.signal; return new Promise(() => {}); };
await assert.rejects(loadMart('sales', { timeoutMs: 10 }), /tiempo máximo/);
assert.equal(signal.aborted, true);
globalThis.fetch = (url, options) => { signal = options.signal; return Promise.resolve({ ok: true, text: () => new Promise(() => {}) }); };
await assert.rejects(loadMart('sales', { timeoutMs: 10 }), /tiempo máximo/);
assert.equal(signal.aborted, true);
let calls = 0;
const partial = { ...results, sales: { status: 'rejected', reason: new Error('404') } };
globalThis.fetch = async () => { calls++; return { ok: true, text: async () => sources.sales }; };
await retryFailedMarts(partial);
assert.equal(calls, 1);
assert.equal(partial.sales.status, 'fulfilled');
assert.equal(partial.products, results.products);

// Valores reales de septiembre: fórmulas y redondeo conservados.
const store = createFilterState();
store.set('resumen', 'year', '2025'); store.set('resumen', 'month', '09');
const rows = name => filterMart(results[name].value, name, store.get());
const values = { ...metrics.calculateSales(rows('sales')), ...metrics.calculateProducts(rows('products')), ...metrics.calculateUsers(rows('web_activity')), ...metrics.calculateNps(rows('nps')) };
assert.equal(values.sales, 16646632.5); assert.equal(values.ticket.toFixed(2), '34182.00');
assert.equal(values.users, 4561); assert.equal(values.nps.toFixed(2), '27.07');
assert.equal(values.productSales, 13433250); assert.equal(values.units, 1018);
console.log('SEPTIEMBRE', JSON.stringify(values));

// Contraste real sRGB y diferencias de forma/trazo.
function luminance(hex) {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
const products = buildProductCharts(results, store.get());
const config = productChartConfiguration('product-evolution', products['product-evolution']);
for (const dataset of config.data.datasets) {
  for (const background of ['#ffffff', '#fbfcfb']) {
    const [low, high] = [luminance(dataset.borderColor), luminance(background)].sort((a, b) => a - b);
    assert.ok((high + .05) / (low + .05) >= 3);
  }
}
assert.notDeepEqual(config.data.datasets[0].borderDash, config.data.datasets[1].borderDash);
assert.notEqual(config.data.datasets[0].pointStyle, config.data.datasets[1].pointStyle);

const summary = buildSummaryCharts(results, store.get());
const table = chartTableModel('sales-daily', summary['sales-daily']);
assert.equal(table.rows.length, 30);
assert.equal(table.headers[0], 'Fecha');
const empty = chartTableModel('nps', { labels: ['01/09/2025'], values: [null] });
assert.match(empty.error, /Sin datos/);
const mixed = chartTableModel('nps', { labels: ['01/09/2025', '02/09/2025'], values: [null, 0] });
assert.equal(mixed.rows[0][1], 'Sin datos'); assert.equal(mixed.rows[1][1], '0');
assert.equal(chartTableModel('nps', { error: '404' }).error, 'Error de carga: 404');

// Semántica nativa details/summary y tablas que se actualizan sin cerrar la opción.
function element(tag = 'div') {
  return { tag, children: [], attributes: {}, textContent: '', open: false,
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute(key, value) { this.attributes[key] = value; },
  };
}
const keys = ['sales-daily', 'sales-province', 'users-daily', 'nps', 'product-evolution', 'product-ranking', 'product-province'];
const cards = new Map();
const containers = keys.map(key => {
  const card = element('article'); card.querySelector = () => ({ textContent: key }); cards.set(key, card);
  return { dataset: { chart: key }, closest: () => card };
});
globalThis.document = { querySelectorAll: () => containers, createElement: element };
const unsubscribe = initializeChartTables(results, store);
assert.equal(cards.size, 7);
for (const card of cards.values()) {
  const details = card.children[0];
  assert.equal(details.tag, 'details');
  assert.equal(details.children[0].tag, 'summary');
  assert.equal(details.children[0].textContent, 'Ver datos');
  assert.ok(details.children[0].attributes['aria-label']);
  const region = details.children[1];
  assert.equal(region.tabIndex, 0);
  const dataTable = region.children[0];
  assert.equal(dataTable.tag, 'table');
  assert.equal(dataTable.children[0].tag, 'caption');
  assert.equal(dataTable.children[1].children[0].children[0].scope, 'col');
  assert.equal(dataTable.children[2].children[0].children[0].scope, 'row');
}
const details = cards.get('sales-daily').children[0]; details.open = true;
const before = details.children[1].children[0];
store.set('resumen', 'province', 'Córdoba');
assert.equal(details.open, true);
assert.notEqual(details.children[1].children[0], before);
store.set('resumen', 'year', '1900');
assert.match(details.children[1].children[0].textContent, /Sin datos/);
unsubscribe();
console.log('OK: duplicados de los cuatro granos, NPS inconsistente, timeout de cabecera/cuerpo, reintento, contraste, trazos, siete tablas accesibles y filtros.');
