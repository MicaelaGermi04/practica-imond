import { loadDataMarts, retryFailedMarts } from './data.js';
import { calculateSales, calculateProducts, calculateUsers, calculateNps } from './metrics.js';
import { createFilterState } from './filter-state.js';
import { filterMart } from './filtering.js';
import { initializeFilters } from './filters.js';

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });
const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const points = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const groups = {
  sales: { calculate: calculateSales, keys: ['sales', 'ticket'] },
  products: { calculate: calculateProducts, keys: ['productSales', 'units'] },
  web_activity: { calculate: calculateUsers, keys: ['users'] },
  nps: { calculate: calculateNps, keys: ['nps'] },
};

function showKpi(key, value, status) {
  const card = document.querySelector(`[data-kpi="${key}"]`);
  const output = card.querySelector('.kpi-value');
  const format = ['sales', 'ticket', 'productSales'].includes(key) ? money : key === 'nps' ? points : integer;
  output.textContent = value === null ? '—' : format.format(value);
  output.setAttribute('aria-label', value === null ? status : `${output.textContent}${key === 'nps' ? ' puntos' : ''}`);
  card.querySelector('.empty-label').textContent = status;
}

export async function initializeKpis() {
  const errorMessage = document.querySelector('[data-load-error]');
  const badge = document.querySelector('.preview-badge');
  const retryButton = document.querySelector('[data-retry-load]');
  errorMessage.hidden = true;
  errorMessage.textContent = '';
  badge.textContent = 'Cargando datos';
  for (const group of Object.values(groups)) for (const key of group.keys) showKpi(key, null, 'Cargando…');
  const results = await loadDataMarts();
  const store = createFilterState();
  function render(state) {
    const errors = [];
    const empty = [];
    for (const [name, group] of Object.entries(groups)) {
      try {
        const result = results[name];
        if (result.status === 'rejected') throw result.reason;
        const values = group.calculate(filterMart(result.value, name, state));
        const view = name === 'products' ? 'productos' : 'resumen';
        const local = state[view];
        const filtered = state.period.year || state.period.month ||
          (name !== 'web_activity' && local.channel) ||
          (['sales', 'products'].includes(name) && local.province) ||
          (name === 'products' && local.product);
        for (const [key, value] of Object.entries(values)) showKpi(key, value, value === null ? 'Sin datos' : filtered ? 'Selección actual' : 'Todo el período disponible');
        if (!result.value.length) empty.push(`mart_${name}.csv`);
      } catch (error) {
        errors.push(error.message);
        for (const key of group.keys) showKpi(key, null, 'Error de carga');
      }
    }
    badge.textContent = errors.length ? 'Carga incompleta' : 'Datos conectados';
    retryButton.hidden = !Object.values(results).some(result => result.status === 'rejected');
    errorMessage.textContent = [
      errors.length ? `No se pudieron mostrar todos los indicadores. ${errors.join(' ')}` : '',
      empty.length ? `Archivos sin registros: ${empty.join(', ')}.` : '',
    ].filter(Boolean).join(' ');
    errorMessage.hidden = errorMessage.textContent === '';
  }
  const refreshFilters = initializeFilters(results, store);
  let retrying = false;
  async function retry() {
    if (retrying) return;
    retrying = true;
    retryButton.disabled = true;
    retryButton.textContent = 'Reintentando…';
    try {
      await retryFailedMarts(results);
      refreshFilters();
      // Notifica a KPI, gráficos y tablas conservando todas las selecciones.
      store.set('resumen', 'year', store.get().period.year);
    } finally {
      retrying = false;
      retryButton.disabled = false;
      retryButton.textContent = 'Reintentar carga';
    }
  }
  retryButton.addEventListener('click', retry);
  store.subscribe(render);
  render(store.get());
  return { results, store, retry };
}
