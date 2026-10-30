import { filterMart } from './filtering.js';
import { calculateSales, calculateUsers, calculateNps } from './metrics.js';

function dailyGroups(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.date_id)) groups.set(row.date_id, []);
    groups.get(row.date_id).push(row);
  }
  return groups;
}

export function summaryCalendar(results, state) {
  let first = Infinity, last = -Infinity;
  for (const result of Object.values(results)) {
    if (result.status !== 'fulfilled') continue;
    for (const row of result.value) {
      first = Math.min(first, row.date_id);
      last = Math.max(last, row.date_id);
    }
  }
  if (!Number.isFinite(first)) return [];
  const iso = id => `${String(id).slice(0, 4)}-${String(id).slice(4, 6)}-${String(id).slice(6)}`;
  const date = new Date(`${iso(first)}T00:00:00Z`);
  const end = new Date(`${iso(last)}T00:00:00Z`);
  const calendar = [];
  while (date <= end) {
    calendar.push({ date_id: Number(date.toISOString().slice(0, 10).replaceAll('-', '')) });
    date.setUTCDate(date.getUTCDate() + 1);
  }
  // El calendario solo recibe el período; se reutiliza el alcance web.
  return filterMart(calendar, 'web_activity', state).map(row => row.date_id);
}

export function buildSummaryCharts(results, state) {
  const dates = summaryCalendar(results, state);
  const specs = {
    'sales-daily': { mart: 'sales', calculate: rows => calculateSales(rows).sales },
    'users-daily': { mart: 'web_activity', calculate: rows => calculateUsers(rows).users },
    nps: { mart: 'nps', calculate: rows => calculateNps(rows).nps },
  };
  const charts = {};
  for (const [key, spec] of Object.entries(specs)) {
    const result = results[spec.mart];
    if (result.status !== 'fulfilled') { charts[key] = { error: result.reason.message }; continue; }
    const groups = dailyGroups(filterMart(result.value, spec.mart, state));
    charts[key] = {
      labels: dates.map(id => `${String(id).slice(6)}/${String(id).slice(4, 6)}/${String(id).slice(0, 4)}`),
      values: dates.map(id => spec.calculate(groups.get(id) ?? [])),
    };
  }
  const sales = results.sales;
  if (sales.status !== 'fulfilled') charts['sales-province'] = { error: sales.reason.message };
  else {
    const comparisonState = { ...state, resumen: { ...state.resumen, province: '' } };
    const provinces = new Map();
    for (const row of filterMart(sales.value, 'sales', comparisonState)) {
      if (!provinces.has(row.province_name)) provinces.set(row.province_name, []);
      provinces.get(row.province_name).push(row);
    }
    const ranking = [...provinces].map(([name, rows]) => [name, calculateSales(rows).sales])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
    charts['sales-province'] = { labels: ranking.map(row => row[0]), values: ranking.map(row => row[1]) };
  }
  return charts;
}
