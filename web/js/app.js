import { initializeNavigation } from './navigation.js';
import { initializeKpis } from './kpis.js';
import { initializeSummaryCharts } from './summary-charts.js';
import { initializeProductCharts } from './product-charts.js';
import { initializeChartTables } from './chart-tables.js';

initializeNavigation();
const { results, store } = await initializeKpis();
initializeChartTables(results, store);
initializeSummaryCharts(results, store);
initializeProductCharts(results, store);
