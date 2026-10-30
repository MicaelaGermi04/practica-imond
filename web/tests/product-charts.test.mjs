// Desde la raíz: node --experimental-vm-modules web/tests/product-charts.test.mjs
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
const { normalizeMart } = (await load('web/js/data.js')).namespace;
const { createFilterState } = (await load('web/js/filter-state.js')).namespace;
const { buildProductCharts } = (await load('web/js/product-chart-data.js')).namespace;
const { productChartConfiguration, initializeProductCharts } = (await load('web/js/product-charts.js')).namespace;
const rows = normalizeMart(await readFile('dw/mart_products.csv', 'utf8'), 'products');
const results = { products: { status: 'fulfilled', value: rows } };
const store = createFilterState();
let models = buildProductCharts(results, store.get());
const evolution = models['product-evolution'];
assert.equal(evolution.labels[0], '01/01/2024');
assert.equal(evolution.labels.at(-1), '30/09/2025');
assert.deepEqual(evolution.series.map(series => series.name), ['Classic A Bottle', 'Sport B Bottle']);
assert.equal(evolution.series.flatMap(series => series.values).reduce((sum, value) => sum + (value ?? 0), 0), 309891600);
const totals = new Map();
for (const row of rows) totals.set(row.product_name, (totals.get(row.product_name) ?? 0) + row.product_sales);
const expected = [...totals].sort((a, b) => b[1] - a[1]);
assert.deepEqual(models['product-ranking'].labels, expected.map(row => row[0]));
assert.deepEqual(models['product-ranking'].series[0].values, expected.map(row => row[1] / 100));
assert.equal(models['product-ranking'].title, 'Ranking del período seleccionado');
store.set('productos', 'month', '09');
assert.equal(buildProductCharts(results, store.get())['product-ranking'].title, 'Ranking del período seleccionado');
store.set('productos', 'year', '2025');
store.set('productos', 'channel', 'ONLINE');
models = buildProductCharts(results, store.get());
assert.equal(models['product-ranking'].title, 'Ranking mensual de productos');
assert.equal(models['product-evolution'].labels.length, 30);
for (const series of models['product-evolution'].series) {
  const expectedDay = rows.filter(row => row.date_id === 20250901 && row.channel_code === 'ONLINE' && row.product_key === series.id);
  assert.equal(series.values[0], expectedDay.length ? expectedDay.reduce((sum, row) => sum + row.product_sales, 0) / 100 : null);
}
const before = models;
store.set('productos', 'province', 'Córdoba');
models = buildProductCharts(results, store.get());
assert.deepEqual(models['product-province'], before['product-province']);
assert.notDeepEqual(models['product-evolution'], before['product-evolution']);
assert.notDeepEqual(models['product-ranking'], before['product-ranking']);
const selected = models['product-evolution'].series[1];
store.set('productos', 'product', selected.id);
models = buildProductCharts(results, store.get());
assert.equal(models['product-evolution'].series.length, 1);
assert.equal(models['product-evolution'].series[0].color, selected.color);
assert.equal(models['product-province'].series.length, 1);
assert.deepEqual(models['product-ranking'].labels, [selected.name]);
const provinceRows = rows.filter(row => row.date_id >= 20250901 && row.date_id <= 20250930 && row.channel_code === 'ONLINE' && row.product_key === selected.id);
const provinceTotals = new Map();
for (const row of provinceRows) provinceTotals.set(row.province_name, (provinceTotals.get(row.province_name) ?? 0) + row.product_sales);
const provinceExpected = [...provinceTotals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
assert.deepEqual(models['product-province'].labels, provinceExpected.map(row => row[0]));
assert.deepEqual(models['product-province'].series[0].values, provinceExpected.map(row => row[1] / 100));
const prior = models;
store.set('resumen', 'channel', 'OFFLINE');
store.set('resumen', 'province', 'Mendoza');
assert.deepEqual(buildProductCharts(results, store.get()), prior);
store.set('productos', 'year', '1900');
assert.ok(Object.values(buildProductCharts(results, store.get())).every(model => model.series.every(series => series.values.length === 0)));
const failed = buildProductCharts({ products: { status: 'rejected', reason: new Error('404') } }, store.get());
assert.ok(Object.values(failed).every(model => model.error === '404'));
store.reset('productos');
models = buildProductCharts(results, store.get());
const config = productChartConfiguration('product-province', models['product-province']);
assert.equal(config.type, 'bar');
assert.equal(config.options.indexAxis, 'y');
assert.equal(config.options.scales.x.stacked, false);
assert.equal(config.data.datasets.length, 2);
assert.equal(productChartConfiguration('product-evolution', models['product-evolution']).type, 'line');

// El ranking debe ser por importe aun si las unidades ordenarían al revés.
const example = rows.slice(0, 2).map((row, index) => ({ ...row, product_key: String(index + 1), product_name: `Producto ${index + 1}`, product_sales: index ? 100 : 1000, total_units: index ? 100 : 1 }));
assert.deepEqual(buildProductCharts({ products: { status: 'fulfilled', value: example } }, store.get())['product-ranking'].labels, ['Producto 1', 'Producto 2']);

// Controlador: tres instancias, actualizaciones, navegación, vacíos y limpieza.
function element() {
  return { hidden: false, classList: { add() {} }, setAttribute() {},
    children: [], append(child) { this.children.push(child); }, replaceChildren(...children) { this.children = children; },
  };
}
const title = element();
const containers = Object.fromEntries(['product-evolution', 'product-ranking', 'product-province'].map(key => {
  const container = element();
  container.closest = () => ({ querySelector: () => title });
  return [key, container];
}));
let constructed = 0, updates = 0, destroyed = 0, resized = 0;
globalThis.Chart = class {
  constructor(canvas, config) { this.data = config.data; constructed++; }
  update() { updates++; }
  resize() { resized++; }
  destroy() { destroyed++; }
};
globalThis.document = {
  querySelector(selector) { return containers[selector.match(/data-chart="([^"]+)"/)[1]]; },
  createElement: element, head: { append(script) { assert.match(script.src, /chart.js@4\.4\.8/); script.onload(); } },
  getElementById() { return { hidden: false }; },
};
const events = new Map();
globalThis.window = { addEventListener(name, fn) { events.set(name, fn); }, removeEventListener(name) { events.delete(name); } };
globalThis.requestAnimationFrame = fn => fn();
const dispose = await initializeProductCharts(results, store);
assert.equal(constructed, 3);
store.set('productos', 'year', '2025');
store.set('productos', 'month', '09');
assert.equal(title.textContent, 'Ranking mensual de productos');
assert.equal(constructed, 3);
assert.equal(updates, 6);
events.get('hashchange')();
assert.equal(resized, 3);
store.set('productos', 'year', '1900');
assert.ok(Object.values(containers).every(container => !container.children[0].hidden && container.children[0].textContent.includes('Sin datos')));
store.reset('productos');
assert.equal(constructed, 3);
assert.equal(title.textContent, 'Ranking del período seleccionado');
dispose();
assert.equal(destroyed, 3);
console.log('OK: agregaciones reales, ranking por facturación, título mensual/período, alcance de filtros, fechas, colores, producto único, vacíos y ciclo de tres instancias.');
