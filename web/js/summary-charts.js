import { buildSummaryCharts } from './chart-data.js';

let chartLibrary;
export function loadChartJs() {
  if (!chartLibrary) chartLibrary = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.8/dist/chart.umd.min.js';
    script.onload = () => globalThis.Chart ? resolve(globalThis.Chart) : reject(new Error('Chart.js no está disponible.'));
    script.onerror = () => reject(new Error('No se pudo cargar Chart.js. Revisá la conexión a Internet.'));
    document.head.append(script);
  });
  return chartLibrary;
}

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });
const number = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const points = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const compactMoney = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', notation: 'compact', maximumFractionDigits: 1 });
const descriptions = {
  'sales-daily': { label: 'Ventas totales', format: money },
  'sales-province': { label: 'Ventas totales', format: money },
  'users-daily': { label: 'Usuarios activos estimados', format: number },
  nps: { label: 'NPS en puntos', format: points },
};

export function chartConfiguration(key, series) {
  const horizontal = key === 'sales-province';
  const nps = key === 'nps';
  const monetary = key.startsWith('sales');
  const { label, format } = descriptions[key];
  const valueAxis = {
    beginAtZero: !nps,
    ...(nps ? { min: -100, max: 100 } : {}),
    title: { display: true, text: monetary ? 'ARS' : nps ? 'NPS · puntos' : 'Usuarios estimados' },
    ticks: {
      maxTicksLimit: 5,
      ...(key === 'users-daily' ? { precision: 0 } : {}),
      callback: value => (monetary ? compactMoney : format).format(value),
    },
    grid: { color: '#e6eee8' },
    border: { display: false },
  };
  const labelAxis = {
    grid: { display: false }, border: { display: false },
    ticks: { autoSkip: !horizontal, maxTicksLimit: horizontal ? undefined : 6, maxRotation: 0, font: { size: 10 } },
  };
  return {
    type: horizontal ? 'bar' : 'line',
    data: {
      labels: series.labels,
      datasets: [{
        label, data: series.values, borderColor: '#0D4B3E',
        backgroundColor: horizontal ? '#417D60' : 'rgba(13,75,62,0.07)',
        borderWidth: horizontal ? 0 : 2,
        borderRadius: horizontal ? 4 : 0,
        maxBarThickness: 28,
        pointRadius: nps ? 3 : 0, pointHoverRadius: 4, pointHitRadius: 8,
        tension: 0, spanGaps: false, fill: false,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      indexAxis: horizontal ? 'y' : 'x',
      color: '#5e726a', font: { family: 'Segoe UI, Arial, sans-serif', size: 11 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: context => `${label}: ${format.format(horizontal ? context.parsed.x : context.parsed.y)}${nps ? ' puntos' : ''}` } },
      },
      scales: horizontal ? { x: valueAxis, y: labelAxis } : { x: labelAxis, y: valueAxis },
    },
  };
}

// Una instancia por contenedor, actualizada con chart.update('none').
export async function initializeSummaryCharts(results, store) {
  const containers = new Map(Object.keys(descriptions).map(key => [key, document.querySelector(`#view-resumen [data-chart="${key}"]`)]));
  const instances = new Map();
  const surfaces = new Map();
  for (const [key, container] of containers) {
    const message = document.createElement('p');
    message.className = 'chart-message';
    message.setAttribute('role', 'status');
    message.textContent = 'Cargando gráfico…';
    container.replaceChildren(message);
    surfaces.set(key, { message });
  }
  let Chart;
  try { Chart = await loadChartJs(); }
  catch (error) {
    for (const { message } of surfaces.values()) message.textContent = error.message;
    return;
  }
  function render() {
    const charts = buildSummaryCharts(results, store.get());
    for (const [key, series] of Object.entries(charts)) {
      const container = containers.get(key);
      const surface = surfaces.get(key);
      const hasData = !series.error && series.values.some(value => value !== null);
      surface.message.hidden = hasData;
      surface.message.textContent = series.error ? `Error de carga: ${series.error}` : 'Sin datos para los filtros seleccionados.';
      if (surface.frame) surface.frame.hidden = !hasData;
      if (!hasData) continue;
      if (!surface.frame) {
        surface.frame = document.createElement('div');
        surface.frame.className = 'chart-frame';
        surface.canvas = document.createElement('canvas');
        surface.canvas.setAttribute('role', 'img');
        surface.canvas.setAttribute('aria-label', descriptions[key].label);
        surface.canvas.textContent = 'Gráfico interactivo. Los valores están disponibles al recorrer sus puntos.';
        surface.frame.append(surface.canvas);
        container.append(surface.frame);
      }
      surface.frame.hidden = false;
      container.classList.add('chart-rendered');
      try {
        if (instances.has(key)) {
          const chart = instances.get(key);
          chart.data.labels = series.labels;
          chart.data.datasets[0].data = series.values;
          chart.update('none');
        } else instances.set(key, new Chart(surface.canvas, chartConfiguration(key, series)));
      } catch (error) {
        surface.frame.hidden = true;
        surface.message.hidden = false;
        surface.message.textContent = `No se pudo dibujar el gráfico: ${error.message}`;
      }
    }
  }
  const unsubscribe = store.subscribe(render);
  const onNavigate = () => {
    if (!document.getElementById('view-resumen').hidden) {
      requestAnimationFrame(() => { for (const chart of instances.values()) chart.resize(); });
    }
  };
  window.addEventListener('hashchange', onNavigate);
  render();
  return () => {
    unsubscribe();
    window.removeEventListener('hashchange', onNavigate);
    for (const chart of instances.values()) chart.destroy();
  };
}
