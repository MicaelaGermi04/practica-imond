import { filterMart } from './filtering.js';
import { calculateProducts } from './metrics.js';
import { summaryCalendar } from './chart-data.js';

function group(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row[key])) groups.set(row[key], []);
    groups.get(row[key]).push(row);
  }
  return groups;
}
const sales = rows => calculateProducts(rows).productSales;

export function buildProductCharts(results, state) {
  const title = state.period.year && state.period.month ? 'Ranking mensual de productos' : 'Ranking del período seleccionado';
  const result = results.products;
  if (result.status !== 'fulfilled') return Object.fromEntries(
    ['product-evolution', 'product-ranking', 'product-province'].map(key => [key, { error: result.reason.message, title }]),
  );
  const rows = filterMart(result.value, 'products', state);
  const comparison = filterMart(result.value, 'products', { ...state, productos: { ...state.productos, province: '' } });
  // Identidad, nombres y asignación estable de colores provienen del Mart.
  const catalog = [...new Map(result.value.map(row => [row.product_key, row.product_name]))]
    .sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }))
    .map(([id, name], index) => ({ id, name, color: ['#0D4B3E', '#417D60'][index % 2] }))
    .filter(product => !state.productos.product || product.id === state.productos.product);
  const dates = summaryCalendar({ products: result }, state);
  const byProduct = group(rows, 'product_key');
  const evolution = catalog.map(product => {
    const days = group(byProduct.get(product.id) ?? [], 'date_id');
    return { ...product, values: dates.map(date => sales(days.get(date) ?? [])) };
  });
  const ranking = [...byProduct].map(([id, items]) => ({ id, name: items[0].product_name, value: sales(items) }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'es'));
  const provinces = [...group(comparison, 'province_name')].map(([name, items]) => ({ name, total: sales(items), products: group(items, 'product_key') }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es'));
  return {
    'product-evolution': {
      labels: dates.map(date => `${String(date).slice(6)}/${String(date).slice(4, 6)}/${String(date).slice(0, 4)}`),
      series: evolution,
    },
    'product-ranking': {
      title, labels: ranking.map(product => product.name),
      series: [{ name: 'Facturación neta', color: '#0D4B3E', values: ranking.map(product => product.value) }],
    },
    'product-province': {
      labels: provinces.map(province => province.name),
      series: catalog.map(product => ({ ...product, values: provinces.map(province => sales(province.products.get(product.id) ?? [])) })),
    },
  };
}
