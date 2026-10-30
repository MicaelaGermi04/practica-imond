// Ejecutar desde la raíz: node --experimental-vm-modules web/tests/filters.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SourceTextModule } from 'node:vm';

// Permite probar los mismos módulos del navegador sin añadir package.json.
const cache = new Map();
async function load(path) {
  path = resolve(path);
  if (cache.has(path)) return cache.get(path);
  const module = new SourceTextModule(await readFile(path, 'utf8'), {
    identifier: path,
    initializeImportMeta(meta) { meta.url = pathToFileURL(path).href; },
  });
  cache.set(path, module);
  await module.link((specifier, parent) => load(resolve(dirname(parent.identifier), specifier)));
  await module.evaluate();
  return module;
}

const { createFilterState } = (await load('web/js/filter-state.js')).namespace;
const { filterMart, buildFilterOptions } = (await load('web/js/filtering.js')).namespace;
const { normalizeMart, schemas } = (await load('web/js/data.js')).namespace;
const metrics = (await load('web/js/metrics.js')).namespace;
const results = {};
for (const name of Object.keys(schemas)) {
  results[name] = { status: 'fulfilled', value: normalizeMart(await readFile(`dw/mart_${name}.csv`, 'utf8'), name) };
}
const store = createFilterState();
let updates = 0;
store.subscribe(() => updates++);
store.set('resumen', 'year', '2025');
store.set('resumen', 'month', '09');
store.set('resumen', 'channel', 'ONLINE');
store.set('resumen', 'province', 'Córdoba');
store.set('productos', 'channel', 'OFFLINE');
const product = results.products.value[0].product_key;
store.set('productos', 'product', product);
let state = store.get();
assert.equal(state.period.year, '2025');
assert.equal(state.productos.channel, 'OFFLINE');
assert.equal(state.resumen.channel, 'ONLINE');
assert.equal(state.productos.province, '');
const dateMatches = row => row.date_id >= 20250901 && row.date_id <= 20250930;
const web = filterMart(results.web_activity.value, 'web_activity', state);
assert.deepEqual(web, results.web_activity.value.filter(dateMatches));
const nps = filterMart(results.nps.value, 'nps', state);
assert.deepEqual(nps, results.nps.value.filter(row => dateMatches(row) && row.channel_code === 'ONLINE'));
const sales = filterMart(results.sales.value, 'sales', state);
assert.deepEqual(sales, results.sales.value.filter(row => dateMatches(row) && row.channel_code === 'ONLINE' && row.province_name === 'Córdoba'));
const products = filterMart(results.products.value, 'products', state);
assert.deepEqual(products, results.products.value.filter(row => dateMatches(row) && row.channel_code === 'OFFLINE' && row.product_key === product));
const webBefore = metrics.calculateUsers(web).users;
const npsBefore = metrics.calculateNps(nps).nps;
store.set('resumen', 'province', 'Mendoza');
assert.equal(metrics.calculateUsers(filterMart(results.web_activity.value, 'web_activity', store.get())).users, webBefore);
assert.equal(metrics.calculateNps(filterMart(results.nps.value, 'nps', store.get())).nps, npsBefore);
store.set('resumen', 'channel', 'OFFLINE');
assert.equal(metrics.calculateUsers(filterMart(results.web_activity.value, 'web_activity', store.get())).users, webBefore);
store.reset('productos');
state = store.get();
assert.deepEqual(state.period, { year: '', month: '' });
assert.deepEqual(state.productos, { channel: '', province: '', product: '' });
assert.deepEqual(state.resumen, { channel: 'OFFLINE', province: 'Mendoza' });
store.reset('resumen');
assert.equal(metrics.calculateSales(filterMart(results.sales.value, 'sales', store.get())).sales, 382410636);
assert.equal(metrics.calculateUsers(filterMart(results.web_activity.value, 'web_activity', store.get())).users, 73828);
store.set('resumen', 'year', '1900'); // Caso sin coincidencias; no se ofrece como opción.
assert.equal(metrics.calculateSales(filterMart(results.sales.value, 'sales', store.get())).sales, null);
assert.equal(metrics.calculateUsers(filterMart(results.web_activity.value, 'web_activity', store.get())).users, null);
assert.equal(metrics.calculateNps(filterMart(results.nps.value, 'nps', store.get())).nps, null);
assert.equal(metrics.calculateProducts(filterMart(results.products.value, 'products', store.get())).units, null);
assert.ok(updates > 0);
const options = buildFilterOptions(results);
assert.deepEqual(options.period.year.map(option => option.value), ['2024', '2025']);
assert.ok(options.productos.product.every(option => results.products.value.some(row => row.product_key === option.value && row.product_name === option.label)));
const partial = buildFilterOptions({ ...results, products: { status: 'rejected' } });
assert.equal(partial.productos.product.length, 0);
assert.ok(partial.period.year.length);

// Integración del controlador con eventos de select y botón, sin navegador.
globalThis.Option = class { constructor(label, value) { this.label = label; this.value = value; } };
const controls = Object.fromEntries(['resumen', 'productos'].map(view => [view,
  Object.keys(view === 'resumen' ? { year: 1, month: 1, channel: 1, province: 1 } : { year: 1, month: 1, channel: 1, province: 1, product: 1 })
    .map(key => ({ dataset: { filter: key }, value: '', disabled: true,
      replaceChildren(...children) { this.options = children; },
      addEventListener(type, listener) { this[type] = listener; },
    })),
]));
const buttons = Object.fromEntries(['resumen', 'productos'].map(view => [view, { addEventListener(type, fn) { this[type] = fn; } }]));
globalThis.document = {
  getElementById(id) {
    const view = id.replace('view-', '');
    return { querySelectorAll() { return controls[view]; }, querySelector() { return buttons[view]; } };
  },
  querySelectorAll(selector) { return controls[selector.includes('view-resumen') ? 'resumen' : 'productos']; },
};
const { initializeFilters } = (await load('web/js/filters.js')).namespace;
const uiStore = createFilterState();
initializeFilters(results, uiStore);
const select = (view, key) => controls[view].find(item => item.dataset.filter === key);
select('resumen', 'year').value = '2025';
select('resumen', 'year').change();
assert.equal(select('productos', 'year').value, '2025');
select('productos', 'month').value = '09';
select('productos', 'month').change();
assert.equal(select('resumen', 'month').value, '09');
select('resumen', 'channel').value = 'ONLINE';
select('resumen', 'channel').change();
assert.equal(select('productos', 'channel').value, '');
buttons.productos.click();
assert.equal(select('resumen', 'year').value, '');
assert.equal(select('resumen', 'month').value, '');
assert.equal(select('resumen', 'channel').value, 'ONLINE');
assert.ok(controls.productos.every(control => !control.disabled && control.options[0].label === 'Todos'));

// Recorrido completo: carga -> controles -> filtrado -> tarjetas KPI.
const element = () => ({ textContent: '', setAttribute() {} });
const notice = element();
const badge = element();
const retryButton = { ...element(), addEventListener(type, fn) { this[type] = fn; } };
const cards = Object.fromEntries(['sales', 'ticket', 'users', 'nps', 'productSales', 'units'].map(key => {
  const value = element(), status = element();
  return [key, { value, status, querySelector(selector) { return selector === '.kpi-value' ? value : status; } }];
}));
document.querySelector = selector => {
  if (selector === '.notice') return notice;
  if (selector === '.preview-badge') return badge;
  if (selector === '[data-retry-load]') return retryButton;
  return cards[selector.match(/data-kpi="([^"]+)"/)[1]];
};
globalThis.fetch = async url => ({ ok: true, text: () => readFile(url, 'utf8') });
const { initializeKpis } = (await load('web/js/kpis.js')).namespace;
await initializeKpis();
assert.equal(cards.users.value.textContent, '73.828');
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });
assert.equal(cards.sales.value.textContent, money.format(382410636));
for (const [key, value] of [['year', '2025'], ['month', '09'], ['channel', 'ONLINE']]) {
  select('resumen', key).value = value;
  select('resumen', key).change();
}
const expectedSales = metrics.calculateSales(results.sales.value.filter(row => dateMatches(row) && row.channel_code === 'ONLINE'));
assert.equal(cards.sales.value.textContent, money.format(expectedSales.sales));
assert.equal(cards.ticket.value.textContent, money.format(expectedSales.ticket));
const usersText = cards.users.value.textContent;
const npsText = cards.nps.value.textContent;
select('resumen', 'province').value = 'Córdoba';
select('resumen', 'province').change();
assert.equal(cards.users.value.textContent, usersText);
assert.equal(cards.nps.value.textContent, npsText);
assert.equal(select('productos', 'month').value, '09');
buttons.resumen.click();
assert.equal(cards.users.value.textContent, '73.828');
assert.equal(cards.sales.value.textContent, money.format(382410636));
globalThis.fetch = async url => url.pathname.endsWith('mart_sales.csv')
  ? { ok: false, status: 404 }
  : { ok: true, text: () => readFile(url, 'utf8') };
const retrySession = await initializeKpis();
assert.equal(cards.sales.status.textContent, 'Error de carga');
assert.equal(cards.users.value.textContent, '73.828');
assert.match(notice.textContent, /404/);
assert.ok(!select('productos', 'product').disabled);
assert.equal(retryButton.hidden, false);
select('resumen', 'year').value = '2025';
select('resumen', 'year').change();
select('resumen', 'month').value = '09';
select('resumen', 'month').change();
const calls = [];
globalThis.fetch = async url => { calls.push(url.pathname); return { ok: true, text: () => readFile(url, 'utf8') }; };
await retrySession.retry();
assert.equal(calls.length, 1);
assert.ok(calls[0].endsWith('mart_sales.csv'));
assert.equal(retryButton.hidden, true);
assert.equal(cards.sales.value.textContent, money.format(16646632.5));
assert.equal(select('productos', 'year').value, '2025');
assert.equal(select('productos', 'month').value, '09');
console.log('OK: filtros con CSV reales, alcance por Mart, sincronización, independencia, restablecimiento, vacíos, eventos y actualización integral de KPI, incluso con carga parcial.');
