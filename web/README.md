# EcoBottle AR · Interfaz web

Dashboard con las dos vistas aprobadas, filtros interactivos, indicadores y siete gráficos Chart.js calculados desde los cuatro Data Marts originales.

## Visualización local

Desde la raíz del repositorio:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Abrir http://localhost:8000/web/ en el navegador. Detener el servidor con Ctrl+C. El servidor debe iniciarse desde la raíz del repositorio para servir tanto `web/` como `dw/`.

Se necesita servir la página por HTTP para cargar los módulos JavaScript; no abrir `index.html` directamente con `file://`.

## Estructura

- `index.html`: dos vistas, filtros, botones de restablecimiento, tarjetas y contenedores de gráficos.
- `css/styles.css`: identidad visual, estilos y adaptación responsive.
- `js/app.js`: punto de entrada.
- `js/navigation.js`: navegación por fragmentos de URL, incluyendo atrás y adelante del navegador.
- `js/csv.js`: parser CSV con encabezados, comillas escapadas, campos con comas, saltos internos, CRLF y BOM.
- `js/data.js`: carga independiente de los cuatro archivos, validación de columnas y conversión de tipos. Fechas UTC sin desplazamiento de calendario, identificadores como cadenas canónicas exactas y clientes anónimos como `null`. Los importes se guardan en centavos enteros.
- `js/metrics.js`: cálculos reutilizables sin dependencia del DOM.
- `js/kpis.js`: presentación de indicadores y estados de carga, error o ausencia de datos.
- `js/filter-state.js`: estado compartido de período, selecciones por vista y notificaciones de cambios.
- `js/filtering.js`: opciones derivadas de los CSV y único punto de aplicación de filtros por Mart.
- `js/filters.js`: opciones, eventos de controles y sincronización de sus valores con el estado.
- `js/chart-data.js` y `js/summary-charts.js`: agregaciones, calendario UTC y presentación de los cuatro gráficos de Resumen; carga única de Chart.js.
- `js/product-chart-data.js`: agregaciones diarias, ranking por importe y comparación provincial por producto.
- `js/product-charts.js`: configuración y ciclo de vida de los tres gráficos de productos; reutiliza la configuración visual y el cargador de Chart.js existentes.
- `js/chart-tables.js`: alternativa «Ver datos» para los siete gráficos, calculada a partir de los mismos modelos filtrados.
- `tests/filters.test.mjs`: verificaciones de estado, filtrado y eventos de interfaz con los CSV originales, sin modificarlos.
- `tests/charts.test.mjs` y `tests/product-charts.test.mjs`: agregaciones y ciclo de vida de los gráficos.
- `README.md`: instrucciones locales y alcance.

## Alcance

Los seis KPI se recalculan en memoria con cada cambio de filtro, sin nuevas descargas ni recargas de página. Al iniciar, «Todos» incluye todo el período disponible. Ticket y NPS utilizan razones de sumas; usuarios activos deduplica clientes identificados dentro del período y agrega sesiones anónimas. Sin filas o sin denominador se muestra un guion y «Sin datos», no un cero ficticio. Un error de un Mart no impide presentar los restantes.

Los archivos se resuelven mediante URL relativa al módulo: `../../dw/mart_*.csv` desde `web/js/`. Para una futura publicación en GitHub Pages debe conservarse la estructura `web/` y `dw/` dentro de la misma raíz publicada, incluyendo los cuatro CSV originales; la entrada será `/nombre-del-repositorio/web/`. Publicar solamente `web/` no es suficiente. No se configuró despliegue en esta etapa.

Chart.js 4.4.8 se carga una sola vez desde `https://cdn.jsdelivr.net/npm/chart.js@4.4.8/dist/chart.umd.min.js`. Se necesita Internet para esa dependencia; si falla, se muestra un mensaje y los KPI y filtros siguen funcionando. Los gráficos utilizan exclusivamente los datos de los CSV, sin datos de ejemplo.

## Filtros interactivos

- Año y Mes están compartidos entre las dos vistas; Canal y Provincia conservan selecciones independientes. Producto solo se aplica a Análisis de productos y utiliza `product_key` como identidad.
- «Restablecer filtros» limpia el período compartido y los filtros locales de la vista donde se pulsa; conserva Canal, Provincia y Producto de la otra vista.
- Las opciones se extraen de los archivos cargados correctamente. Los meses se presentan en español y se extraen de las fechas existentes, sin generar meses adicionales. Año y Mes usan la unión de fechas de los cuatro Marts. En Resumen, Canal utiliza ventas y NPS; Provincia utiliza ventas. Las opciones de productos provienen de su Mart.
- Las listas permanecen estables: no se restringen según otros filtros. Esto permite seleccionar combinaciones sin coincidencias, que muestran «Sin datos». Mes con Año «Todos» incluye ese mes en todos los años disponibles.
- Durante la carga los controles están deshabilitados. Si un archivo falla, solo se habilitan las listas con opciones provenientes de los archivos disponibles; el error se mantiene visible.
- La selección se conserva durante la navegación entre vistas y se reinicia al recargar la página. No se guarda en almacenamiento local.

| Mart | Filtros aplicados |
| --- | --- |
| Ventas | Año, Mes, Canal y Provincia de Resumen |
| Productos | Año, Mes, Canal, Provincia y Producto de Análisis de productos |
| Actividad web | Solamente Año y Mes |
| NPS | Año, Mes y Canal de Resumen |

No se cambiaron las fórmulas en `metrics.js` ni la distribución visual. Solo se añadió el estilo del botón de restablecimiento en la cabecera de filtros. Los únicos indicadores y gráficos son los definidos en el README principal.

## Gráficos de Análisis de productos

- **Evolución:** suma de `product_sales` por día y `product_key`, con nombres tomados del CSV. Classic A Bottle utiliza verde oscuro y Sport B Bottle verde suave; los colores se conservan al elegir un solo producto. Recibe todos los filtros de la vista. Fechas ordenadas y calendario UTC sin desplazamientos horarios; los días sin registros conservan `null`, sin inventar ventas cero.
- **Ranking:** suma de facturación neta por producto y orden descendente por importe, nunca por unidades. Recibe todos los filtros. Con Año y Mes específicos, el título es «Ranking mensual de productos»; con «Todos» en cualquiera de los dos, «Ranking del período seleccionado», incluso si Mes está seleccionado pero abarca distintos años. Se conservan los nombres completos.
- **Comparación provincial:** barras horizontales agrupadas por producto, sin apilar, ordenadas por la suma de facturación neta de cada provincia. Recibe Año, Mes, Canal y Producto; ignora Provincia. Las series sin registros mantienen valores nulos.

Los tres gráficos reutilizan `filterMart` y `calculateProducts`; los importes se suman en centavos y se presentan en ARS con formato argentino. La comparación provincial de ambos dashboards es la excepción al alcance general de Provincia indicado en la tabla de filtros.

Cada contenedor conserva una sola instancia: al cambiar filtros se reemplazan etiquetas y series y se llama a `update('none')`. Al volver a la vista se ajusta el tamaño con `resize()`. Hay estados de carga, ausencia de coincidencias y errores; un estado vacío no genera nuevas instancias. La distribución y altura existentes se mantienen. Los KPI y segmentadores no fueron modificados.

Para ejecutar las pruebas desde la raíz, con Node.js:

```powershell
node --experimental-vm-modules web/tests/filters.test.mjs
node --experimental-vm-modules web/tests/charts.test.mjs
node --experimental-vm-modules web/tests/product-charts.test.mjs
node --experimental-vm-modules web/tests/audit-fixes.test.mjs
```

Las pruebas verifican septiembre de 2025 sobre los CSV reales, exclusión de Provincia en NPS y de Canal/Provincia en actividad web, Producto, sincronización de controles, independencia entre vistas, restablecimiento y ausencia de resultados. La verificación de eventos utiliza controles de prueba en memoria; no sustituye una revisión visual en navegador.

Las tres suites pasaron tras integrar productos. La suite de productos compara las sumas diarias y el ranking contra agregaciones independientes de los CSV, comprueba filtros locales, selección única de producto, colores estables, orden provincial, títulos y ausencia de registros. Incluye un caso aislado de prueba que invierte unidades e importe para verificar el criterio del ranking; ese caso no se utiliza en la aplicación. El ciclo de instancias se prueba con un sustituto de Chart.js en memoria, sin verificar visualmente el canvas.

## Valores de referencia verificados

Sin filtros, para los CSV disponibles al implementar esta etapa (pueden cambiar si se reemplazan las fuentes):

| Indicador | Valor presentado |
| --- | --- |
| Ventas totales | $382.410.636,00 ARS |
| Ticket promedio | $34.770,93 ARS |
| Usuarios activos estimados | 73.828 |
| NPS | 30,00 puntos |
| Facturación de productos | $309.891.600,00 ARS |
| Unidades vendidas | 23.545 |

Se validaron los cuatro CSV con los módulos JavaScript y se contrastaron los seis resultados con un cálculo independiente en memoria con aritmética decimal, sin modificar los archivos fuente. Se comprobaron campos CSV con comas, comillas y saltos internos; clientes repetidos; denominadores vacíos; y carga parcial con un archivo no encontrado. No se realizó verificación visual en navegador en esta etapa.

## Correcciones de auditoría

- NPS utiliza marcadores de radio 3 para los días con respuestas. Se conserva `spanGaps: false`, los valores nulos sin respuestas y la escala de −100 a 100. La regresión comprueba los puntos aislados del 3, 12, 15 y 25 de septiembre de 2025 para OFFLINE.
- El verde secundario es `#417D60`, con contraste superior a 3:1 sobre blanco y sobre el fondo del gráfico. Classic y Sport también se distinguen mediante línea continua/discontinua y círculo/triángulo. Las fórmulas y los colores de la identidad general no cambian.
- Cada gráfico incluye un desplegable nativo `details`/`summary` «Ver datos», cerrado inicialmente. El navegador permite operarlo con Tab, Enter y Espacio. Las tablas tienen título, encabezados de columna y de fila, importes ARS y una región de desplazamiento con nombre accesible y foco de teclado. Se mantienen abiertas al filtrar y sus valores se actualizan con los mismos modelos usados por los gráficos, incluidas las excepciones provinciales. «Sin datos» no se convierte en cero. Las tablas funcionan aunque Chart.js no pueda descargarse.
- `data.js` rechaza filas duplicadas por el grano específico de cada Mart, incluidos grupos anónimos y claves normalizadas, y rechaza componentes NPS que no sumen `total_responses`. El mensaje identifica el archivo y el registro; no se eliminan ni corrigen filas.
- Cada CSV tiene un plazo máximo de 15 segundos que incluye descarga de cabeceras y cuerpo. Un botón «Reintentar carga» aparece si falla algún Mart. Reintenta únicamente los archivos fallidos, evita solicitudes simultáneas por doble clic y conserva el estado de filtros. Actualiza opciones, KPI, gráficos y tablas sin recargar la página ni duplicar instancias. El reintento se refiere a los CSV; Chart.js continúa siendo una dependencia externa.

Se ejecutaron y aprobaron las cuatro suites, incluidas pruebas de timeout, recuperación de un 404, conservación de filtros al reintentar, validación de duplicados, consistencia NPS, contraste calculado y semántica de siete tablas. Los seis KPI de septiembre de 2025 volvieron a coincidir: ventas $16.646.632,50; ticket $34.182,00; usuarios 4.561; NPS 27,07; productos $13.433.250,00; unidades 1.018.

La comprobación de acceso al navegador devolvió `The browser access host is unavailable`. Por tanto, no se ejecutaron pruebas visuales reales a 360, 768 o 1366 píxeles, ni se verificó la interacción física de teclado, lector de pantalla o consola del navegador. Las pruebas de tablas y controles utilizan DOM en memoria. Esa revisión queda pendiente antes de publicar.
