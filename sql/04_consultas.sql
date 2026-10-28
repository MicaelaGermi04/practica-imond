-- =====================================================================
-- 04_consultas.sql — Consultas para revisar el modelo y calcular KPIs
-- =====================================================================
-- Cada SELECT de este archivo se muestra en la terminal al ejecutar
-- run_sql.py. Usalo para:
--   * comprobar que las tablas se cargaron bien (cantidad de filas, nulos...)
--   * escribir las consultas clave de los KPIs que pide la consigna
--     (ventas, usuarios activos, ticket promedio, NPS, ventas por provincia,
--     ranking mensual por producto) usando las tablas del modelo estrella.
-- =====================================================================

-- Consultas de control del Data Warehouse y de los Data Marts.

-- =====================================================================
-- 1. VALIDACION DE CARGAS: RAW VS DATA WAREHOUSE
-- =====================================================================
SELECT 'dim_product' AS tabla,
       (SELECT COUNT(*) FROM raw.product) AS registros_raw,
       (SELECT COUNT(*) FROM dim_product) AS registros_dw
UNION ALL SELECT 'dim_channel', (SELECT COUNT(*) FROM raw.channel), (SELECT COUNT(*) FROM dim_channel)
UNION ALL SELECT 'dim_customer', (SELECT COUNT(*) FROM raw.customer), (SELECT COUNT(*) FROM dim_customer)
UNION ALL SELECT 'dim_location', (SELECT COUNT(*) FROM raw.address), (SELECT COUNT(*) FROM dim_location)
UNION ALL SELECT 'dim_store', (SELECT COUNT(*) FROM raw.store), (SELECT COUNT(*) FROM dim_store)
UNION ALL SELECT 'fact_sales', (SELECT COUNT(*) FROM raw.sales_order), (SELECT COUNT(*) FROM fact_sales)
UNION ALL SELECT 'fact_sales_item', (SELECT COUNT(*) FROM raw.sales_order_item), (SELECT COUNT(*) FROM fact_sales_item)
UNION ALL SELECT 'fact_payment', (SELECT COUNT(*) FROM raw.payment), (SELECT COUNT(*) FROM fact_payment)
UNION ALL SELECT 'fact_shipment', (SELECT COUNT(*) FROM raw.shipment), (SELECT COUNT(*) FROM fact_shipment)
UNION ALL SELECT 'fact_web_session', (SELECT COUNT(*) FROM raw.web_session), (SELECT COUNT(*) FROM fact_web_session)
UNION ALL SELECT 'fact_nps', (SELECT COUNT(*) FROM raw.nps_response), (SELECT COUNT(*) FROM fact_nps);
-- dim_date no se compara con RAW: se genera con un calendario propio.

-- Comprobar cobertura del calendario para todos los timestamps usados como claves de fecha.
-- Esperado: fechas_fuera_de_dim_date = 0 en cada origen.
SELECT 'sales_order.order_date' AS origen,
       COUNT(*) AS fechas_fuera_de_dim_date
FROM raw.sales_order r LEFT JOIN dim_date d
    ON CAST(r.order_date AS DATE) = d.full_date
WHERE r.order_date IS NOT NULL AND d.date_id IS NULL
UNION ALL
SELECT 'payment.paid_at', COUNT(*)
FROM raw.payment r LEFT JOIN dim_date d
    ON CAST(r.paid_at AS DATE) = d.full_date
WHERE r.paid_at IS NOT NULL AND d.date_id IS NULL
UNION ALL
SELECT 'shipment.shipped_at', COUNT(*)
FROM raw.shipment r LEFT JOIN dim_date d
    ON CAST(r.shipped_at AS DATE) = d.full_date
WHERE r.shipped_at IS NOT NULL AND d.date_id IS NULL
UNION ALL
SELECT 'web_session.started_at', COUNT(*)
FROM raw.web_session r LEFT JOIN dim_date d
    ON CAST(r.started_at AS DATE) = d.full_date
WHERE r.started_at IS NOT NULL AND d.date_id IS NULL
UNION ALL
SELECT 'nps_response.responded_at', COUNT(*)
FROM raw.nps_response r LEFT JOIN dim_date d
    ON CAST(r.responded_at AS DATE) = d.full_date
WHERE r.responded_at IS NOT NULL AND d.date_id IS NULL;

-- =====================================================================
-- 2. VALIDACION DE VENTAS E ITEMS
-- =====================================================================
-- Solo PAID y FULFILLED cuentan como ventas.
SELECT 'RAW' AS origen,
       COUNT(*) AS pedidos_validos,
       SUM(total_amount) AS ventas_totales,
       ROUND(AVG(total_amount), 2) AS ticket_promedio
FROM raw.sales_order
WHERE status IN ('PAID', 'FULFILLED')
UNION ALL
SELECT 'DW', COUNT(*), SUM(total_amount), ROUND(AVG(total_amount), 2)
FROM fact_sales
WHERE status IN ('PAID', 'FULFILLED');

-- Verificar la conservacion de cantidades e importes de lineas.
SELECT 'RAW' AS origen,
       COUNT(*) AS cantidad_items,
       SUM(quantity) AS unidades,
       SUM(line_total) AS total_productos
FROM raw.sales_order_item
UNION ALL
SELECT 'DW', COUNT(*), SUM(quantity), SUM(line_total)
FROM fact_sales_item;

-- Verificar cada subtotal del pedido contra la suma de sus items.
-- Esperado: 0 pedidos con diferencias.
SELECT COUNT(*) AS pedidos_con_diferencias
FROM fact_sales s
LEFT JOIN (
    SELECT order_id, SUM(line_total) AS total_items
    FROM fact_sales_item
    GROUP BY order_id
) i ON s.order_id = i.order_id
WHERE i.total_items IS NULL
   OR ABS(s.subtotal - i.total_items) > 0.01;

-- Verificar coherencia de total = subtotal + impuestos + envio.
-- Esperado: 0 pedidos con diferencias.
SELECT COUNT(*) AS pedidos_con_total_inconsistente
FROM fact_sales
WHERE ABS(total_amount - (subtotal + tax_amount + shipping_fee)) > 0.01;

-- Distribucion de estados de pedidos.
SELECT status, COUNT(*) AS cantidad_pedidos
FROM fact_sales
GROUP BY status
ORDER BY cantidad_pedidos DESC;

-- =====================================================================
-- 3. REVISION DE PAGOS, ENVIOS, SESIONES Y NPS
-- =====================================================================
SELECT payment_method, payment_status,
       COUNT(*) AS cantidad_pagos, SUM(amount) AS importe_total
FROM fact_payment
GROUP BY payment_method, payment_status
ORDER BY payment_method, payment_status;

SELECT MIN(CAST(paid_at AS DATE)) AS primer_pago,
       MAX(CAST(paid_at AS DATE)) AS ultimo_pago,
       COUNT(*) FILTER (WHERE paid_at IS NULL) AS pagos_sin_fecha
FROM fact_payment;

SELECT shipment_status, COUNT(*) AS cantidad_envios
FROM fact_shipment
GROUP BY shipment_status
ORDER BY cantidad_envios DESC;

SELECT MIN(CAST(shipped_at AS DATE)) AS primer_despacho,
       MAX(CAST(shipped_at AS DATE)) AS ultimo_despacho,
       MIN(CAST(delivered_at AS DATE)) AS primera_entrega,
       MAX(CAST(delivered_at AS DATE)) AS ultima_entrega,
       COUNT(*) FILTER (WHERE shipped_at IS NULL) AS envios_sin_despacho
FROM fact_shipment;

SELECT source, COUNT(*) AS cantidad_sesiones,
       COUNT(*) FILTER (WHERE customer_id IS NULL) AS sesiones_anonimas,
       ROUND(AVG(duration_seconds) FILTER (WHERE duration_seconds >= 0), 2)
           AS duracion_media_segundos
FROM fact_web_session
GROUP BY source
ORDER BY cantidad_sesiones DESC;

SELECT nps_category, COUNT(*) AS cantidad_respuestas
FROM fact_nps
GROUP BY nps_category
ORDER BY cantidad_respuestas DESC;

-- =====================================================================
-- 4. KPIs OBLIGATORIOS
-- =====================================================================

-- KPI 1: Ventas totales y cantidad de pedidos validos.
SELECT COUNT(*) AS pedidos_validos,
       SUM(total_amount) AS ventas_totales_ars
FROM fact_sales
WHERE status IN ('PAID', 'FULFILLED');

-- KPI 2: Usuarios activos del periodo completo.
-- COUNT(DISTINCT customer_id) cuenta clientes identificados una sola vez;
-- las sesiones anonimas se cuentan individualmente por falta de visitor_id.
-- Es una estimacion, NO personas unicas verificables.
SELECT COUNT(DISTINCT customer_id) AS clientes_identificados_activos,
       COUNT(*) FILTER (WHERE customer_id IS NULL) AS sesiones_anonimas,
       COUNT(DISTINCT customer_id)
           + COUNT(*) FILTER (WHERE customer_id IS NULL)
           AS usuarios_activos_estimados
FROM fact_web_session;

-- KPI 3: Ticket promedio (un pedido = una venta de cabecera).
SELECT ROUND(
           SUM(total_amount) / NULLIF(COUNT(*), 0), 2
       ) AS ticket_promedio_ars
FROM fact_sales
WHERE status IN ('PAID', 'FULFILLED');

-- KPI 4: NPS = 100 * (promotores - detractores) / respuestas.
SELECT COUNT(*) AS respuestas,
       ROUND(100.0 * (
           COUNT(*) FILTER (WHERE score BETWEEN 9 AND 10)
           - COUNT(*) FILTER (WHERE score BETWEEN 0 AND 6)
       ) / NULLIF(COUNT(*), 0), 2) AS nps
FROM fact_nps;

-- KPI 5: Ventas por provincia (direccion de envio del pedido).
SELECT COALESCE(l.province_name, 'Sin provincia') AS provincia,
       COUNT(*) AS pedidos_validos,
       SUM(s.total_amount) AS ventas_totales_ars
FROM fact_sales s
LEFT JOIN dim_location l ON s.location_id = l.location_id
WHERE s.status IN ('PAID', 'FULFILLED')
GROUP BY COALESCE(l.province_name, 'Sin provincia')
ORDER BY ventas_totales_ars DESC;

-- KPI 6: Ranking mensual por producto (monto neto de items, sin IVA/envio).
-- Solo se consideran items pertenecientes a pedidos validos.
WITH ventas_producto AS (
    SELECT d.year, d.month, p.product_key, p.name AS producto,
           SUM(i.quantity) AS unidades_vendidas,
           SUM(i.line_total) AS ventas_productos_ars
    FROM fact_sales_item i
    JOIN dim_date d ON i.date_id = d.date_id
    JOIN dim_product p ON i.product_key = p.product_key
    WHERE i.order_status IN ('PAID', 'FULFILLED')
    GROUP BY d.year, d.month, p.product_key, p.name
)
SELECT year, month, producto, unidades_vendidas, ventas_productos_ars,
       DENSE_RANK() OVER (
           PARTITION BY year, month
           ORDER BY ventas_productos_ars DESC
       ) AS ranking_mensual
FROM ventas_producto
ORDER BY year, month, ranking_mensual, producto;

-- =====================================================================
-- Validaciones de los cuatro Marts
-- =====================================================================

-- 1. Integridad basica de RAW y hechos (se conservan del proyecto).
SELECT 'dim_product' AS tabla,
       (SELECT COUNT(*) FROM raw.product) AS registros_raw,
       (SELECT COUNT(*) FROM dim_product) AS registros_dw
UNION ALL SELECT 'dim_channel', (SELECT COUNT(*) FROM raw.channel), (SELECT COUNT(*) FROM dim_channel)
UNION ALL SELECT 'dim_customer', (SELECT COUNT(*) FROM raw.customer), (SELECT COUNT(*) FROM dim_customer)
UNION ALL SELECT 'dim_location', (SELECT COUNT(*) FROM raw.address), (SELECT COUNT(*) FROM dim_location)
UNION ALL SELECT 'dim_store', (SELECT COUNT(*) FROM raw.store), (SELECT COUNT(*) FROM dim_store)
UNION ALL SELECT 'fact_sales', (SELECT COUNT(*) FROM raw.sales_order), (SELECT COUNT(*) FROM fact_sales)
UNION ALL SELECT 'fact_sales_item', (SELECT COUNT(*) FROM raw.sales_order_item), (SELECT COUNT(*) FROM fact_sales_item)
UNION ALL SELECT 'fact_payment', (SELECT COUNT(*) FROM raw.payment), (SELECT COUNT(*) FROM fact_payment)
UNION ALL SELECT 'fact_shipment', (SELECT COUNT(*) FROM raw.shipment), (SELECT COUNT(*) FROM fact_shipment)
UNION ALL SELECT 'fact_web_session', (SELECT COUNT(*) FROM raw.web_session), (SELECT COUNT(*) FROM fact_web_session)
UNION ALL SELECT 'fact_nps', (SELECT COUNT(*) FROM raw.nps_response), (SELECT COUNT(*) FROM fact_nps);

-- 2. Cobertura de dim_date: el resultado esperado es 0 por origen.
SELECT 'sales_order.order_date' AS origen, COUNT(*) AS fuera_calendario
FROM raw.sales_order r LEFT JOIN dim_date d ON CAST(r.order_date AS DATE) = d.full_date
WHERE r.order_date IS NOT NULL AND d.date_id IS NULL
UNION ALL
SELECT 'web_session.started_at', COUNT(*)
FROM raw.web_session r LEFT JOIN dim_date d ON CAST(r.started_at AS DATE) = d.full_date
WHERE r.started_at IS NOT NULL AND d.date_id IS NULL
UNION ALL
SELECT 'nps_response.responded_at', COUNT(*)
FROM raw.nps_response r LEFT JOIN dim_date d ON CAST(r.responded_at AS DATE) = d.full_date
WHERE r.responded_at IS NOT NULL AND d.date_id IS NULL;

-- 3. Comparacion exacta de ventas validas y cantidad de pedidos.
SELECT
    (SELECT COUNT(*) FROM fact_sales
     WHERE status IN ('PAID', 'FULFILLED')) AS orders_fact,
    (SELECT SUM(total_orders) FROM mart_sales) AS orders_mart,
    (SELECT SUM(total_amount) FROM fact_sales
     WHERE status IN ('PAID', 'FULFILLED')) AS sales_fact,
    (SELECT SUM(total_sales) FROM mart_sales) AS sales_mart;

-- 4. Ticket global: razon de sumas (NO promedio de tickets diarios).
SELECT
    SUM(total_orders) AS pedidos,
    SUM(total_sales) AS ventas,
    ROUND(SUM(total_sales) / NULLIF(SUM(total_orders), 0), 2)
        AS avg_ticket_global
FROM mart_sales;

-- 5. Total de items validos frente al Mart de productos.
SELECT
    (SELECT SUM(quantity) FROM fact_sales_item
     WHERE order_status IN ('PAID', 'FULFILLED')) AS units_fact,
    (SELECT SUM(total_units) FROM mart_products) AS units_mart,
    (SELECT SUM(line_total) FROM fact_sales_item
     WHERE order_status IN ('PAID', 'FULFILLED')) AS sales_items_fact,
    (SELECT SUM(product_sales) FROM mart_products) AS sales_items_mart;

-- 6. Sesiones web: ninguna se pierde al agrupar por dia y cliente.
SELECT
    (SELECT COUNT(*) FROM fact_web_session) AS sessions_fact,
    (SELECT SUM(total_sessions) FROM mart_web_activity) AS sessions_mart,
    (SELECT COUNT(*) FROM fact_web_session
     WHERE customer_id IS NULL) AS anonymous_fact,
    (SELECT SUM(anonymous_sessions) FROM mart_web_activity)
        AS anonymous_mart;

-- 7. Usuarios unicos por MES: comparar fact con Mart.
-- Esperado: cero filas. La parte anonima es recuento de sesiones.
WITH a AS (
    SELECT DATE_TRUNC('month', started_at)::DATE AS month_start,
           COUNT(DISTINCT customer_id)
             + COUNT(*) FILTER (WHERE customer_id IS NULL) AS users_fact
    FROM fact_web_session
    GROUP BY 1
), b AS (
    SELECT month_start,
           COUNT(DISTINCT customer_id)
             + SUM(anonymous_sessions) AS users_mart
    FROM mart_web_activity
    GROUP BY 1
)
SELECT COALESCE(a.month_start, b.month_start) AS month_start,
       a.users_fact, b.users_mart
FROM a FULL OUTER JOIN b ON a.month_start = b.month_start
WHERE a.users_fact IS DISTINCT FROM b.users_mart;

-- 8. NPS: cantidad de respuestas y resultado global.
SELECT
    (SELECT COUNT(*) FROM fact_nps) AS responses_fact,
    (SELECT SUM(total_responses) FROM mart_nps) AS responses_mart,
    (SELECT ROUND(100.0 * (
        COUNT(*) FILTER (WHERE nps_category = 'PROMOTER')
        - COUNT(*) FILTER (WHERE nps_category = 'DETRACTOR')
     ) / NULLIF(COUNT(*), 0), 2) FROM fact_nps) AS nps_fact,
    ROUND(100.0 * (SUM(promoters) - SUM(detractors)) /
        NULLIF(SUM(total_responses), 0), 2) AS nps_mart
FROM mart_nps;

-- 9. Comprobar unicidad de grano (esperado: 0 filas en todos).
SELECT 'mart_sales' AS tabla, COUNT(*) AS filas_duplicadas
FROM (
    SELECT date_id, channel_id, province_name
    FROM mart_sales GROUP BY 1,2,3 HAVING COUNT(*) > 1
) x
UNION ALL
SELECT 'mart_products', COUNT(*) FROM (
    SELECT date_id, channel_id, province_name, product_key
    FROM mart_products GROUP BY 1,2,3,4 HAVING COUNT(*) > 1
) x
UNION ALL
SELECT 'mart_web_activity', COUNT(*) FROM (
    SELECT date_id, customer_id
    FROM mart_web_activity GROUP BY 1,2 HAVING COUNT(*) > 1
) x
UNION ALL
SELECT 'mart_nps', COUNT(*) FROM (
    SELECT date_id, channel_id
    FROM mart_nps GROUP BY 1,2 HAVING COUNT(*) > 1
) x;

-- 10. Ejemplo de resultado MENSUAL de ventas, sin Mart mensual.
SELECT month_start, SUM(total_orders) AS pedidos,
       SUM(total_sales) AS ventas,
       ROUND(SUM(total_sales) / NULLIF(SUM(total_orders), 0), 2)
           AS ticket_promedio
FROM mart_sales
GROUP BY month_start
ORDER BY month_start;

-- 11. Ejemplo de NPS mensual (sin promediar NPS diarios).
SELECT month_start, SUM(total_responses) AS respuestas,
       ROUND(100.0 * (SUM(promoters) - SUM(detractors)) /
           NULLIF(SUM(total_responses), 0), 2) AS nps_mensual
FROM mart_nps
GROUP BY month_start
ORDER BY month_start;

-- 12. Ranking mensual de productos (monto neto de items).
WITH ventas_producto AS (
    SELECT month_start, product_key, product_name,
           SUM(total_units) AS unidades,
           SUM(product_sales) AS ventas_productos
    FROM mart_products
    GROUP BY month_start, product_key, product_name
)
SELECT month_start, product_name, unidades, ventas_productos,
       DENSE_RANK() OVER (
           PARTITION BY month_start ORDER BY ventas_productos DESC
       ) AS ranking_mensual
FROM ventas_producto
ORDER BY month_start, ranking_mensual, product_name;
