const scopes = {
  sales: { view: 'resumen', columns: { channel: 'channel_code', province: 'province_name' } },
  products: { view: 'productos', columns: { channel: 'channel_code', province: 'province_name', product: 'product_key' } },
  web_activity: { view: 'resumen', columns: {} },
  nps: { view: 'resumen', columns: { channel: 'channel_code' } },
};

// Único punto de aplicación de filtros. Nunca cruza dimensiones entre Marts.
export function filterMart(rows, name, state) {
  const scope = scopes[name];
  if (!scope) throw new Error('Mart desconocido.');
  return rows.filter(row => {
    const date = String(row.date_id);
    if (state.period.year && date.slice(0, 4) !== state.period.year) return false;
    if (state.period.month && date.slice(4, 6) !== state.period.month) return false;
    return Object.entries(scope.columns).every(([key, column]) => {
      const value = state[scope.view][key];
      return !value || row[column] === value;
    });
  });
}

export function buildFilterOptions(results) {
  const rows = name => results[name]?.status === 'fulfilled' ? results[name].value : [];
  const all = Object.keys(scopes).flatMap(rows);
  const values = (data, column) => [...new Set(data.map(row => row[column]))]
    .sort((a, b) => String(a).localeCompare(String(b), 'es', { numeric: true }))
    .map(value => ({ value, label: value }));
  const years = [...new Set(all.map(row => String(row.date_id).slice(0, 4)))].sort();
  const months = [...new Set(all.map(row => String(row.date_id).slice(4, 6)))].sort();
  const monthFormat = new Intl.DateTimeFormat('es-AR', { month: 'long', timeZone: 'UTC' });
  const products = rows('products');
  const productNames = new Map(products.map(row => [row.product_key, row.product_name]));
  return {
    period: {
      year: years.map(value => ({ value, label: value })),
      month: months.map(value => ({ value, label: monthFormat.format(new Date(`2000-${value}-01T00:00:00Z`)) })),
    },
    resumen: {
      channel: values([...rows('sales'), ...rows('nps')], 'channel_code'),
      province: values(rows('sales'), 'province_name'),
    },
    productos: {
      channel: values(products, 'channel_code'),
      province: values(products, 'province_name'),
      product: values(products, 'product_key').map(option => ({ ...option, label: productNames.get(option.value) })),
    },
  };
}
