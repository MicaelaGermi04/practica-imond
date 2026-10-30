import { parseCSV } from './csv.js';

const common = { date_id: 'dateId', month_start: 'date' };
const channel = { channel_id: 'id', channel_code: 'text' };
export const LOAD_TIMEOUT_MS = 15000;
const grains = {
  sales: ['date_id', 'channel_id', 'province_name'],
  products: ['date_id', 'channel_id', 'province_name', 'product_key'],
  web_activity: ['date_id', 'customer_id'],
  nps: ['date_id', 'channel_id'],
};
export const schemas = {
  sales: { ...common, ...channel, province_name: 'text', total_orders: 'integer', total_sales: 'money', avg_ticket_daily: 'money' },
  products: { ...common, ...channel, province_name: 'text', product_key: 'id', product_name: 'text', total_units: 'integer', product_sales: 'money', orders_with_product: 'integer' },
  web_activity: { ...common, customer_id: 'nullableId', active_customers_daily: 'integer', total_sessions: 'integer', anonymous_sessions: 'integer', duration_sum_seconds: 'integer', duration_count: 'integer' },
  nps: { ...common, ...channel, total_responses: 'integer', promoters: 'integer', passives: 'integer', detractors: 'integer', nps_daily: 'number' },
};

function calendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('fecha inválida');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('fecha inválida');
  return date;
}

function convert(raw, type) {
  const value = raw.trim();
  if (type === 'nullableId' && value === '') return null;
  if (value === '') throw new Error('valor obligatorio vacío');
  if (type === 'text') return value;
  if (type === 'date') return calendarDate(value);
  if (type === 'dateId') {
    if (!/^\d{8}$/.test(value)) throw new Error('date_id inválido');
    calendarDate(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`);
    return Number(value);
  }
  if (type === 'id' || type === 'nullableId') {
    if (!/^\d+$/.test(value)) throw new Error('identificador inválido');
    return BigInt(value).toString(); // Identidad exacta, incluso por encima del límite seguro de Number.
  }
  if (type === 'money') {
    if (!/^-?\d+(\.\d{1,2})?$/.test(value)) throw new Error('importe inválido');
    const negative = value.startsWith('-');
    const [whole, decimals = ''] = value.replace(/^-/, '').split('.');
    const cents = Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
    if (!Number.isSafeInteger(cents)) throw new Error('importe fuera del rango seguro');
    return negative ? -cents : cents; // Importes almacenados en centavos.
  }
  if (!/^-?\d+(\.\d+)?$/.test(value)) throw new Error('número inválido');
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('número fuera de rango');
  if (type === 'integer' && (!Number.isSafeInteger(number) || number < 0)) throw new Error('recuento inválido');
  return number;
}

export function normalizeMart(text, name) {
  const schema = schemas[name];
  if (!schema) throw new Error('Mart desconocido.');
  const parsed = parseCSV(text);
  const missing = Object.keys(schema).filter(column => !parsed.headers.includes(column));
  if (missing.length) throw new Error(`Faltan columnas: ${missing.join(', ')}.`);
  const seen = new Map();
  return parsed.rows.map((row, index) => {
    const result = {};
    for (const [column, type] of Object.entries(schema)) {
      try { result[column] = convert(row[column], type); }
      catch (error) { throw new Error(`Registro ${index + 2}, columna ${column}: ${error.message}.`); }
    }
    const month = String(result.date_id).slice(0, 6);
    if (result.month_start.toISOString().slice(0, 10).replaceAll('-', '') !== `${month}01`) {
      throw new Error(`Registro ${index + 2}: month_start no coincide con date_id.`);
    }
    const key = JSON.stringify(grains[name].map(column => result[column]));
    if (seen.has(key)) throw new Error(`Registro ${index + 2}: fila duplicada según el grano de mart_${name}; coincide con el registro ${seen.get(key)}.`);
    seen.set(key, index + 2);
    if (name === 'nps' && BigInt(result.promoters) + BigInt(result.passives) + BigInt(result.detractors) !== BigInt(result.total_responses)) {
      throw new Error(`Registro ${index + 2}: promotores + pasivos + detractores no coincide con total_responses.`);
    }
    return result;
  });
}

export async function loadMart(name, { timeoutMs = LOAD_TIMEOUT_MS } = {}) {
  // Relativa al módulo: /repositorio/web/js/ -> /repositorio/dw/.
  const url = new URL(`../../dw/mart_${name}.csv`, import.meta.url);
  const controller = new AbortController();
  let timer;
  try {
    // Incluye la descarga del cuerpo y no depende de que fetch respete signal.
    const text = await Promise.race([
      (async () => {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) {
          throw new Error(response.status === 404 ? 'Archivo no encontrado (404).' : `Error HTTP ${response.status}.`);
        }
        return response.text();
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Se superó el tiempo máximo de carga (${timeoutMs / 1000} s). Reintentá la carga.`));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
    return normalizeMart(text, name);
  } catch (error) {
    throw new Error(`dw/mart_${name}.csv: ${error.message}`);
  } finally { clearTimeout(timer); }
}

export async function retryFailedMarts(results) {
  const names = Object.keys(schemas).filter(name => results[name]?.status === 'rejected');
  const retried = await Promise.allSettled(names.map(name => loadMart(name)));
  names.forEach((name, i) => { results[name] = retried[i]; });
}

export async function loadDataMarts() {
  const names = Object.keys(schemas);
  const results = await Promise.allSettled(names.map(loadMart));
  return Object.fromEntries(names.map((name, i) => [name, results[i]]));
}
