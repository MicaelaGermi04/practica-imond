import { buildFilterOptions } from './filtering.js';

export function initializeFilters(results, store) {
  function refresh() {
    const options = buildFilterOptions(results);
    for (const view of ['resumen', 'productos']) {
      const section = document.getElementById(`view-${view}`);
      for (const select of section.querySelectorAll('[data-filter]')) {
        const key = select.dataset.filter;
        const choices = options.period[key] ?? options[view][key];
        select.replaceChildren(new Option('Todos', ''), ...choices.map(({ value, label }) => new Option(label, value)));
        select.disabled = choices.length === 0;
        if (select.disabled) select.replaceChildren(new Option('Sin datos disponibles', ''));
      }
    }
  }
  for (const view of ['resumen', 'productos']) {
    const section = document.getElementById(`view-${view}`);
    for (const select of section.querySelectorAll('[data-filter]')) {
      select.addEventListener('change', () => store.set(view, select.dataset.filter, select.value));
    }
    const reset = section.querySelector('[data-reset-filters]');
    reset.disabled = false;
    reset.addEventListener('click', () => store.reset(view));
  }
  const sync = state => {
    for (const view of ['resumen', 'productos']) {
      for (const select of document.querySelectorAll(`#view-${view} [data-filter]`)) {
        const key = select.dataset.filter;
        select.value = state.period[key] ?? state[view][key];
      }
    }
  };
  store.subscribe(sync);
  refresh();
  sync(store.get());
  return () => { refresh(); sync(store.get()); };
}
