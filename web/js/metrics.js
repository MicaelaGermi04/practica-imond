function sum(rows, column) {
  return rows.reduce((total, row) => {
    const next = total + row[column];
    if (!Number.isSafeInteger(next)) throw new Error(`La suma de ${column} supera el rango numérico seguro.`);
    return next;
  }, 0);
}

export function calculateSales(rows) {
  const salesCents = sum(rows, 'total_sales');
  const orders = sum(rows, 'total_orders');
  return { sales: rows.length ? salesCents / 100 : null, ticket: orders ? salesCents / orders / 100 : null };
}

export function calculateProducts(rows) {
  return { productSales: rows.length ? sum(rows, 'product_sales') / 100 : null, units: rows.length ? sum(rows, 'total_units') : null };
}

export function calculateUsers(rows) {
  if (!rows.length) return { users: null };
  const identified = new Set(rows.filter(row => row.customer_id !== null).map(row => row.customer_id));
  return { users: identified.size + sum(rows, 'anonymous_sessions') };
}

export function calculateNps(rows) {
  const responses = sum(rows, 'total_responses');
  return { nps: responses ? 100 * (sum(rows, 'promoters') - sum(rows, 'detractors')) / responses : null };
}
