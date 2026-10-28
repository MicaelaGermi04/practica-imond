-- =====================================================================
-- 03_marts.sql — EcoBottle | Data Marts para Power BI
-- =====================================================================
-- Se crea UN Mart por area:
--   mart_sales        : ventas por dia, canal y provincia
--   mart_products     : productos por dia, canal y provincia
--   mart_web_activity : actividad por dia y cliente identificado; una fila adicional por dia para anonim@s
--   mart_nps          : NPS por dia y canal
-- =====================================================================
-- 1. MART_SALES
-- =====================================================================
-- Grano: UNA fila por fecha, canal y provincia de la venta.
-- Importe: total_amount del pedido (incluye IVA y envio).
-- Ventas validas: PAID o FULFILLED.
-- NULL en provincia se identifica como 'SIN PROVINCIA'.
-- =====================================================================
CREATE TABLE mart_sales AS
SELECT
    s.date_id,
    DATE_TRUNC('month', d.full_date)::DATE AS month_start,
    s.channel_id,
    c.code AS channel_code,
    COALESCE(l.province_name, 'SIN PROVINCIA') AS province_name,
    COUNT(*) AS total_orders,
    CAST(SUM(s.total_amount) AS DECIMAL(18,2)) AS total_sales,
    CAST(ROUND(SUM(s.total_amount) / NULLIF(COUNT(*), 0), 2)
        AS DECIMAL(18,2)) AS avg_ticket_daily
FROM fact_sales s
INNER JOIN dim_date d ON s.date_id = d.date_id
INNER JOIN dim_channel c ON s.channel_id = c.channel_id
LEFT JOIN dim_location l ON s.location_id = l.location_id
WHERE s.status IN ('PAID', 'FULFILLED')
GROUP BY
    s.date_id, d.full_date, s.channel_id, c.code,
    COALESCE(l.province_name, 'SIN PROVINCIA');


-- =====================================================================
-- 2. MART_PRODUCTS
-- =====================================================================
-- Grano: UNA fila por fecha, canal, provincia y producto.
-- Importe: line_total de items (SIN impuestos ni envio).
-- =====================================================================
CREATE TABLE mart_products AS
SELECT
    i.date_id,
    DATE_TRUNC('month', d.full_date)::DATE AS month_start,
    i.channel_id,
    c.code AS channel_code,
    COALESCE(l.province_name, 'SIN PROVINCIA') AS province_name,
    i.product_key,
    p.name AS product_name,
    SUM(i.quantity) AS total_units,
    CAST(SUM(i.line_total) AS DECIMAL(18,2)) AS product_sales,
    COUNT(DISTINCT i.order_id) AS orders_with_product
FROM fact_sales_item i
INNER JOIN dim_date d ON i.date_id = d.date_id
INNER JOIN dim_channel c ON i.channel_id = c.channel_id
INNER JOIN dim_product p ON i.product_key = p.product_key
LEFT JOIN dim_location l ON i.location_id = l.location_id
WHERE i.order_status IN ('PAID', 'FULFILLED')
GROUP BY
    i.date_id, d.full_date, i.channel_id, c.code,
    COALESCE(l.province_name, 'SIN PROVINCIA'),
    i.product_key, p.name;


-- =====================================================================
-- 3. MART_WEB_ACTIVITY
-- =====================================================================
-- Grano: UNA fila por fecha y customer_id para sesiones identificadas;
--        UNA fila adicional por fecha para todas las sesiones anonimas.
-- Se conserva customer_id para contar usuarios unicos de un MES o
-- cualquier rango sin sumar clientes repetidos entre dias.
--
-- Para un dia:
--   SUM(active_customers_daily) + SUM(anonymous_sessions)
-- Para un mes/rango:
--   COUNT(DISTINCT customer_id no nulo) + SUM(anonymous_sessions)
-- La parte anonima es una estimacion: una sesion no equivale
-- necesariamente a una persona unica.
-- duration_sum_seconds / duration_count = duracion media ponderada.
-- Se descartan duraciones negativas o NULL del denominador.
-- =====================================================================
CREATE TABLE mart_web_activity AS
SELECT
    w.date_id,
    DATE_TRUNC('month', d.full_date)::DATE AS month_start,
    w.customer_id,
    CASE WHEN w.customer_id IS NOT NULL THEN 1 ELSE 0 END
        AS active_customers_daily,
    COUNT(*) AS total_sessions,
    COUNT(*) FILTER (WHERE w.customer_id IS NULL)
        AS anonymous_sessions,
    COALESCE(SUM(w.duration_seconds) FILTER (
        WHERE w.duration_seconds >= 0
    ), 0) AS duration_sum_seconds,
    COUNT(*) FILTER (WHERE w.duration_seconds >= 0)
        AS duration_count
FROM fact_web_session w
INNER JOIN dim_date d ON w.date_id = d.date_id
GROUP BY w.date_id, d.full_date, w.customer_id;


-- =====================================================================
-- 4. MART_NPS
-- =====================================================================
-- Grano: UNA fila por fecha y canal.
-- NPS diario es informativo: NO sumar ni promediar NPS diarios.
-- Para un mes/rango, reagrupar los componentes aditivos:
--   100 * (SUM(promoters)-SUM(detractors)) / SUM(total_responses)
-- No hay provincia ni producto verificables en las encuestas.
-- =====================================================================
CREATE TABLE mart_nps AS
SELECT
    n.date_id,
    DATE_TRUNC('month', d.full_date)::DATE AS month_start,
    n.channel_id,
    c.code AS channel_code,
    COUNT(*) AS total_responses,
    COUNT(*) FILTER (WHERE n.nps_category = 'PROMOTER') AS promoters,
    COUNT(*) FILTER (WHERE n.nps_category = 'PASSIVE') AS passives,
    COUNT(*) FILTER (WHERE n.nps_category = 'DETRACTOR') AS detractors,
    ROUND(
        100.0 * (
            COUNT(*) FILTER (WHERE n.nps_category = 'PROMOTER')
            - COUNT(*) FILTER (WHERE n.nps_category = 'DETRACTOR')
        ) / NULLIF(COUNT(*), 0), 2
    ) AS nps_daily
FROM fact_nps n
INNER JOIN dim_date d ON n.date_id = d.date_id
INNER JOIN dim_channel c ON n.channel_id = c.channel_id
GROUP BY n.date_id, d.full_date, n.channel_id, c.code;

