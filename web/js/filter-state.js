// Estado independiente del DOM y de los cálculos. Una instancia por aplicación.
export function createFilterState() {
  const state = {
    period: { year: '', month: '' },
    resumen: { channel: '', province: '' },
    productos: { channel: '', province: '', product: '' },
  };
  const listeners = new Set();
  const snapshot = () => Object.fromEntries(Object.entries(state).map(([key, value]) => [key, { ...value }]));
  const notify = () => { for (const listener of listeners) listener(snapshot()); };
  return {
    get: snapshot,
    set(view, key, value) {
      if (!['resumen', 'productos'].includes(view)) throw new Error('Vista desconocida.');
      const target = ['year', 'month'].includes(key) ? state.period : state[view];
      if (!Object.hasOwn(target, key)) throw new Error('Filtro desconocido.');
      target[key] = String(value);
      notify();
    },
    reset(view) {
      if (!['resumen', 'productos'].includes(view)) throw new Error('Vista desconocida.');
      for (const key of Object.keys(state.period)) state.period[key] = '';
      for (const key of Object.keys(state[view])) state[view][key] = '';
      notify();
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
