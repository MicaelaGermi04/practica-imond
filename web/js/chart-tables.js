import { buildSummaryCharts } from './chart-data.js';
import { buildProductCharts } from './product-chart-data.js';

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });
const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const points = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

export function chartTableModel(key, model) {
  if (model.error) return { error: `Error de carga: ${model.error}` };
  const daily = ['sales-daily', 'users-daily', 'nps', 'product-evolution'].includes(key);
  const format = key === 'users-daily' ? integer : key === 'nps' ? points : money;
  const series = model.series ?? [{ name: key === 'nps' ? 'NPS (puntos)' : key === 'users-daily' ? 'Usuarios activos estimados' : 'Facturación (ARS)', values: model.values }];
  if (!series.some(item => item.values.some(value => value !== null))) return { error: 'Sin datos para los filtros seleccionados.' };
  return {
    headers: [daily ? 'Fecha' : key === 'product-ranking' ? 'Producto' : 'Provincia', ...series.map(item => item.name)],
    rows: model.labels.map((label, i) => [label, ...series.map(item => item.values[i] === null ? 'Sin datos' : format.format(item.values[i]))]),
  };
}

export function initializeChartTables(results, store) {
  const panels = new Map();
  for (const container of document.querySelectorAll('[data-chart]')) {
    const key = container.dataset.chart;
    const card = container.closest('.chart-card');
    const title = card.querySelector('h2').textContent;
    const details = document.createElement('details');
    details.className = 'chart-data';
    const summary = document.createElement('summary');
    summary.textContent = 'Ver datos';
    summary.setAttribute('aria-label', `Ver datos: ${title}`);
    const region = document.createElement('div');
    region.className = 'chart-table-scroll';
    region.tabIndex = 0;
    region.setAttribute('role', 'region');
    region.setAttribute('aria-label', `Datos de ${title}`);
    details.append(summary, region);
    card.append(details);
    panels.set(key, { region, title });
  }
  const render = () => {
    const state = store.get();
    const models = { ...buildSummaryCharts(results, state), ...buildProductCharts(results, state) };
    for (const [key, model] of Object.entries(models)) {
      const { region, title } = panels.get(key);
      const data = chartTableModel(key, model);
      if (data.error) {
        const message = document.createElement('p');
        message.textContent = data.error;
        region.replaceChildren(message);
        continue;
      }
      const table = document.createElement('table');
      const caption = document.createElement('caption');
      caption.textContent = `${model.title ?? title} · Filtros activos · ${key === 'nps' ? 'Puntos NPS' : key === 'users-daily' ? 'Usuarios estimados' : 'Importes en ARS'}${key.endsWith('province') ? ' · Ignora Provincia' : ''}`;
      const head = document.createElement('thead');
      const header = document.createElement('tr');
      for (const text of data.headers) {
        const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = text; header.append(cell);
      }
      head.append(header);
      const body = document.createElement('tbody');
      for (const values of data.rows) {
        const row = document.createElement('tr');
        values.forEach((text, i) => {
          const cell = document.createElement(i === 0 ? 'th' : 'td');
          if (i === 0) cell.scope = 'row';
          cell.textContent = text;
          row.append(cell);
        });
        body.append(row);
      }
      table.append(caption, head, body);
      region.replaceChildren(table);
    }
  };
  const unsubscribe = store.subscribe(render);
  render();
  return unsubscribe;
}
