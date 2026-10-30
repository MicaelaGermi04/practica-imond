const views = {
  resumen: {
    title: 'Resumen general',
    description: 'Una mirada integral a las ventas, la actividad web y la satisfacción.',
  },
  productos: {
    title: 'Análisis de productos',
    description: 'El desempeño comercial de los productos, su evolución y distribución provincial.',
  },
};

export function initializeNavigation() {
  const links = document.querySelectorAll('[data-view]');

  function renderView() {
    const requestedView = window.location.hash.slice(1);
    const activeView = Object.hasOwn(views, requestedView) ? requestedView : 'resumen';
    const { title, description } = views[activeView];

    for (const view of Object.keys(views)) {
      document.getElementById(`view-${view}`).hidden = view !== activeView;
    }

    for (const link of links) {
      if (link.dataset.view === activeView) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    }

    document.getElementById('page-title').textContent = title;
    document.getElementById('page-description').textContent = description;
    document.title = `${title} · EcoBottle AR`;
  }

  window.addEventListener('hashchange', renderView);
  renderView();
}
