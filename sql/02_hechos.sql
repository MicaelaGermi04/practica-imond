-- =====================================================================
-- 02_hechos.sql — Tablas de HECHOS del modelo estrella
-- =====================================================================
-- Este archivo se ejecuta después de 01_dimensiones.sql porque los hechos
-- apuntan a las dimensiones con FOREIGN KEY (REFERENCES).
--
-- Para cada tabla de hechos:
--   1. Definí el GRANO: ¿qué representa UNA fila?
--      (ej.: un producto dentro de un pedido, una sesión web, una respuesta NPS)
--   2. CREATE TABLE con:
--        - PRIMARY KEY
--        - una FOREIGN KEY por cada dimensión:  product_key INTEGER REFERENCES dim_product (product_key)
--        - las métricas (cantidades, importes, puntajes...)
--   3. INSERT INTO ... SELECT uniendo las tablas de origen (raw.) con las dimensiones
--      para obtener las claves.
--
-- Patrón para obtener la clave de una dimensión:
--
--   SELECT i.order_item_id, p.product_key, i.quantity, i.line_total
--   FROM raw.sales_order_item AS i
--   JOIN dim_product AS p ON p.product_id = i.product_id
--
-- Si una FOREIGN KEY apunta a una clave que no existe en la dimensión,
-- DuckDB rechaza la carga y run_sql.py te muestra el error.
-- =====================================================================


-- TU TURNO: creá acá las tablas de hechos.

-- ============================================
-- FACT_SALES
-- Una fila por pedido
-- ============================================

CREATE TABLE fact_sales (
    order_id BIGINT NOT NULL PRIMARY KEY,
    date_id INTEGER NOT NULL,
    customer_id INTEGER NOT NULL,
    channel_id INTEGER NOT NULL,
    location_id INTEGER,
    store_id INTEGER,
    order_date TIMESTAMP NOT NULL,
    status VARCHAR(20) NOT NULL
        CHECK (status IN (
            'CREATED',
            'PAID',
            'CANCELLED',
            'FULFILLED',
            'REFUNDED'
        )),
    currency_code CHAR(3),
    subtotal DECIMAL(12,2) NOT NULL,
    tax_amount DECIMAL(12,2) NOT NULL,
    shipping_fee DECIMAL(12,2) NOT NULL,
    total_amount DECIMAL(12,2) NOT NULL,

    FOREIGN KEY (date_id)
        REFERENCES dim_date(date_id),

    FOREIGN KEY (customer_id)
        REFERENCES dim_customer(customer_id),

    FOREIGN KEY (channel_id)
        REFERENCES dim_channel(channel_id),

    FOREIGN KEY (location_id)
        REFERENCES dim_location(location_id),

    FOREIGN KEY (store_id)
        REFERENCES dim_store(store_id)
);
INSERT INTO fact_sales (
    order_id,
    date_id,
    customer_id,
    channel_id,
    location_id,
    store_id,
    order_date,
    status,
    currency_code,
    subtotal,
    tax_amount,
    shipping_fee,
    total_amount
)
SELECT
    order_id,
    CAST(STRFTIME(order_date, '%Y%m%d') AS INTEGER),
    customer_id,
    channel_id,
    shipping_address_id,
    store_id,
    order_date,
    status,
    currency_code,
    subtotal,
    tax_amount,
    shipping_fee,
    total_amount
FROM raw.sales_order;