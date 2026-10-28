-- =====================================================================
-- 03_marts.sql — EcoBottle | Data Marts para Power BI
-- =====================================================================
-- Se crea UN Mart por area:
--   mart_sales        : ventas por dia, canal y provincia
--   mart_products     : productos por dia, canal y provincia
--   mart_web_activity : actividad por dia y cliente identificado; una fila adicional por dia para anonim@s
--   mart_nps          : NPS por dia y canal
-- ============================================================
-- MART DE VENTAS DIARIAS
-- Granularidad: día × canal × provincia
-- ============================================================

CREATE TABLE mart_sales_daily AS
SELECT
    s.date_id,
    DATE_TRUNC('month', d.full_date)::DATE AS month_start,
    s.channel_id,
    c.code AS channel_code,
    COALESCE(l.province_name, 'SIN PROVINCIA') AS province_name,
    COUNT(*) AS total_orders,
    CAST(SUM(s.total_amount) AS DECIMAL(18,2)) AS total_sales,
    CAST(
        ROUND(SUM(s.total_amount) / NULLIF(COUNT(*), 0), 2)
        AS DECIMAL(18,2)
    ) AS avg_ticket_daily
FROM fact_sales s
INNER JOIN dim_date d ON s.date_id = d.date_id
INNER JOIN dim_channel c ON s.channel_id = c.channel_id
LEFT JOIN dim_location l ON s.location_id = l.location_id
WHERE s.status IN ('PAID', 'FULFILLED')
GROUP BY
    s.date_id,
    d.full_date,
    s.channel_id,
    c.code,
    COALESCE(l.province_name, 'SIN PROVINCIA');

-- ============================================================
-- MART DE VENTAS MENSUALES
-- Granularidad: mes × canal × provincia
-- ============================================================

CREATE TABLE mart_sales_monthly AS
SELECT
    DATE_TRUNC('month', d.full_date)::DATE AS month_start,
    s.channel_id,
    c.code AS channel_code,
    COALESCE(l.province_name, 'SIN PROVINCIA') AS province_name,
    COUNT(*) AS total_orders,
    CAST(SUM(s.total_amount) AS DECIMAL(18,2)) AS total_sales,
    CAST(
        ROUND(SUM(s.total_amount) / NULLIF(COUNT(*), 0), 2)
        AS DECIMAL(18,2)
    ) AS avg_ticket_monthly
FROM fact_sales s
INNER JOIN dim_date d ON s.date_id = d.date_id
INNER JOIN dim_channel c ON s.channel_id = c.channel_id
LEFT JOIN dim_location l ON s.location_id = l.location_id
WHERE s.status IN ('PAID', 'FULFILLED')
GROUP BY
    DATE_TRUNC('month', d.full_date),
    s.channel_id,
    c.code,
    COALESCE(l.province_name, 'SIN PROVINCIA');

-- ============================================================
-- MART DE PRODUCTOS DIARIOS
-- Granularidad: día × canal × provincia × producto
-- ============================================================

CREATE TABLE mart_products_daily AS
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
    i.date_id,
    d.full_date,
    i.channel_id,
    c.code,
    COALESCE(l.province_name, 'SIN PROVINCIA'),
    i.product_key,
    p.name;

-- ============================================================
-- MART DE PRODUCTOS MENSUALES
-- Granularidad: mes × canal × provincia × producto
-- ============================================================

CREATE TABLE mart_products_monthly AS
SELECT
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
    DATE_TRUNC('month', d.full_date),
    i.channel_id,
    c.code,
    COALESCE(l.province_name, 'SIN PROVINCIA'),
    i.product_key,
    p.name;

-- ============================================================
-- MART DE ACTIVIDAD WEB DIARIA
-- Granularidad: día × cliente identificado / grupo anónimo
-- ============================================================

CREATE TABLE mart_web_activity_daily AS
SELECT
    w.date_id,
    DATE_TRUNC('month', d.full_date)::DATE AS month_start,
    w.customer_id,
    CASE
        WHEN w.customer_id IS NOT NULL THEN 1
        ELSE 0
    END AS active_customers_daily,
    COUNT(*) AS total_sessions,
    COUNT(*) FILTER (WHERE w.customer_id IS NULL)
        AS anonymous_sessions,
    COALESCE(
        SUM(w.duration_seconds) FILTER (
            WHERE w.duration_seconds >= 0
        ), 0
    ) AS duration_sum_seconds,
    COUNT(*) FILTER (WHERE w.duration_seconds >= 0)
        AS duration_count
FROM fact_web_session w
INNER JOIN dim_date d ON w.date_id = d.date_id
GROUP BY
    w.date_id,
    d.full_date,
    w.customer_id;

-- ============================================================
-- MART DE ACTIVIDAD WEB MENSUAL
-- Granularidad: mes
-- ============================================================

CREATE TABLE mart_web_activity_monthly AS
SELECT
    DATE_TRUNC('month', d.full_date)::DATE AS month_start,

    COUNT(DISTINCT w.customer_id)
        AS active_customers_monthly,

    COUNT(*) AS total_sessions,

    COUNT(*) FILTER (WHERE w.customer_id IS NULL)
        AS anonymous_sessions,

    COALESCE(
        SUM(w.duration_seconds) FILTER (
            WHERE w.duration_seconds >= 0
        ), 0
    ) AS duration_sum_seconds,

    COUNT(*) FILTER (WHERE w.duration_seconds >= 0)
        AS duration_count

FROM fact_web_session w
INNER JOIN dim_date d ON w.date_id = d.date_id
GROUP BY
    DATE_TRUNC('month', d.full_date);

-- ============================================================
-- MART DE NPS DIARIO
-- Granularidad: día × canal
-- ============================================================

CREATE TABLE mart_nps_daily AS
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
GROUP BY
    n.date_id,
    d.full_date,
    n.channel_id,
    c.code;


-- ============================================================
-- MART DE NPS MENSUAL
-- Granularidad: mes × canal
-- ============================================================

CREATE TABLE mart_nps_monthly AS
SELECT
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
    ) AS nps_monthly
FROM fact_nps n
INNER JOIN dim_date d ON n.date_id = d.date_id
INNER JOIN dim_channel c ON n.channel_id = c.channel_id
GROUP BY
    DATE_TRUNC('month', d.full_date),
    n.channel_id,
    c.code;

