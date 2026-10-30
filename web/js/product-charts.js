import { buildProductCharts } from './product-chart-data.js';
import { chartConfiguration, loadChartJs } from './summary-charts.js';

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });
const names = {
  'product-evolution': 'Evolución de facturación por producto',
  'product-ranking': 'Ranking de productos por facturación',
  'product-province': 'Ventas por provincia y producto',
};

export function productChartConfiguration(key, model) {
  const horizontal = key !== 'product-evolution';
  const config = chartConfiguration(horizontal ? 'sales-province' : 'sales-daily', { labels: model.labels, values: [] });
  const base = config.data.datasets[0];
  config.data.datasets = model.series.map(series => ({
    ...base, label: series.name, data: series.values,
    borderColor: series.color, backgroundColor: series.color,
    borderDash: series.color === '#0D4B3E' ? [] : [6, 3],
    pointStyle: series.color === '#0D4B3E' ? 'circle' : 'triangle',
    pointRadius: horizontal ? 0 : 2,
    borderWidth: horizontal ? 1 : 2,
    grouped: true,
  }));
  config.options.plugins.legend = {
    display: key !== 'product-ranking', position: 'bottom',
    labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 10, font: { size: 10 } },
  };
  config.options.plugins.tooltip.callbacks.label = context => {
    const value = horizontal ? context.parsed.x : context.parsed.y;
    return `${context.dataset.label}: ${value === null ? 'Sin datos' : money.format(value)}`;
  };
  if (horizontal) {
    config.options.scales.x.stacked = false;
    config.options.scales.y.stacked = false;
    // Permite nombres completos en el ranking sin truncarlos.
    config.options.scales.y.ticks.font.size = 10;
  }
  return config;
}

export async function initializeProductCharts(results, store) {
  const panels = new Map();
  for (const key of Object.keys(names)) {
    const container = document.querySelector(`#view-productos [data-chart="${key}"]`);
    const message = document.createElement('p');
    message.className = 'chart-message';
    message.setAttribute('role', 'status');
    message.textContent = 'Cargando gráfico…';
    container.replaceChildren(message);
    panels.set(key, { container, message });
  }
  let Chart;
  try { Chart = await loadChartJs(); }
  catch (error) {
    for (const panel of panels.values()) panel.message.textContent = error.message;
    return;
  }
  function render() {
    const models = buildProductCharts(results, store.get());
    for (const [key, model] of Object.entries(models)) {
      const panel = panels.get(key);
      if (key === 'product-ranking') panel.container.closest('.chart-card').querySelector('h2').textContent = model.title;
      const hasData = !model.error && model.series.some(series => series.values.some(value => value !== null));
      panel.message.hidden = hasData;
      panel.message.textContent = model.error ? `Error de carga: ${model.error}` : 'Sin datos para los filtros seleccionados.';
      if (panel.frame) panel.frame.hidden = !hasData;
      if (!hasData) continue;
      if (!panel.frame) {
        panel.frame = document.createElement('div');
        panel.frame.className = 'chart-frame';
        panel.canvas = document.createElement('canvas');
        panel.canvas.setAttribute('role', 'img');
        panel.canvas.setAttribute('aria-label', names[key]);
        panel.frame.append(panel.canvas);
        panel.container.append(panel.frame);
        panel.container.classList.add('chart-rendered');
      }
      panel.frame.hidden = false;
      try {
        const config = productChartConfiguration(key, model);
        if (panel.chart) {
          panel.chart.data = config.data;
          panel.chart.update('none');
        } else panel.chart = new Chart(panel.canvas, config);
      } catch (error) {
        panel.frame.hidden = true;
        panel.message.hidden = false;
        panel.message.textContent = `No se pudo dibujar el gráfico: ${error.message}`;
      }
    }
  }
  const unsubscribe = store.subscribe(render);
  const onNavigate = () => {
    if (!document.getElementById('view-productos').hidden) requestAnimationFrame(() => {
      for (const panel of panels.values()) panel.chart?.resize();
    });
  };
  window.addEventListener('hashchange', onNavigate);
  render();
  return () => {
    unsubscribe();
    window.removeEventListener('hashchange', onNavigate);
    for (const panel of panels.values()) panel.chart?.destroy();
  };
}
