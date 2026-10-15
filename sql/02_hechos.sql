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

-- ============================================
-- FACT_SALES_ITEM
-- Granularidad: una fila por item de pedido
-- ============================================

CREATE TABLE fact_sales_item (
    order_item_id BIGINT NOT NULL PRIMARY KEY,
    order_id BIGINT NOT NULL,
    date_id INTEGER NOT NULL,
    product_key INTEGER NOT NULL,
    channel_id INTEGER NOT NULL,
    order_status VARCHAR(20) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(12,2) NOT NULL,
    discount_amount DECIMAL(12,2) NOT NULL,
    line_total DECIMAL(12,2) NOT NULL,
    location_id INTEGER,

    FOREIGN KEY (date_id)
        REFERENCES dim_date(date_id),

    FOREIGN KEY (product_key)
        REFERENCES dim_product(product_key),

    FOREIGN KEY (channel_id)
        REFERENCES dim_channel(channel_id),
    
    FOREIGN KEY (location_id)
        REFERENCES dim_location(location_id)
    
);
INSERT INTO fact_sales_item (
    order_item_id,
    order_id,
    date_id,
    product_key,
    channel_id,
    location_id,
    order_status,
    quantity,
    unit_price,
    discount_amount,
    line_total
)
SELECT
    i.order_item_id,
    i.order_id,
    CAST(STRFTIME(o.order_date, '%Y%m%d') AS INTEGER),
    p.product_key,
    o.channel_id,
    o.shipping_address_id,
    o.status,
    i.quantity,
    i.unit_price,
    i.discount_amount,
    i.line_total
FROM raw.sales_order_item i
INNER JOIN raw.sales_order o
    ON i.order_id = o.order_id
INNER JOIN dim_product p
    ON i.product_id = p.product_id;

-- ============================================
-- FACT_PAYMENT
-- Granularidad: una fila por pago
-- ============================================

CREATE TABLE fact_payment (
    payment_id BIGINT NOT NULL PRIMARY KEY,
    order_id BIGINT NOT NULL,
    date_id INTEGER,
    customer_id INTEGER NOT NULL,
    channel_id INTEGER NOT NULL,
    payment_method VARCHAR(20) NOT NULL
        CHECK (payment_method IN (
            'CASH',
            'CARD',
            'TRANSFER',
            'GATEWAY'
        )),
    payment_status VARCHAR(20) NOT NULL
        CHECK (payment_status IN (
            'PENDING',
            'PAID',
            'FAILED',
            'REFUNDED'
        )),
    amount DECIMAL(12,2) NOT NULL,
    paid_at TIMESTAMP,
    transaction_ref VARCHAR(80),

    FOREIGN KEY (date_id)
        REFERENCES dim_date(date_id),
    FOREIGN KEY (customer_id)
        REFERENCES dim_customer(customer_id),
    FOREIGN KEY (channel_id)
        REFERENCES dim_channel(channel_id)
);

INSERT INTO fact_payment (
    payment_id,
    order_id,
    date_id,
    customer_id,
    channel_id,
    payment_method,
    payment_status,
    amount,
    paid_at,
    transaction_ref
)
SELECT
    p.payment_id,
    p.order_id,
    CASE
        WHEN p.paid_at IS NOT NULL
        THEN CAST(STRFTIME(p.paid_at, '%Y%m%d') AS INTEGER)
        ELSE NULL
    END,
    o.customer_id,
    o.channel_id,
    p.method,
    p.status,
    p.amount,
    p.paid_at,
    p.transaction_ref
FROM raw.payment p
INNER JOIN raw.sales_order o
    ON p.order_id = o.order_id;

-- ============================================
-- FACT_SHIPMENT
-- Granularidad: una fila por envio
-- ============================================

CREATE TABLE fact_shipment (
    shipment_id BIGINT NOT NULL PRIMARY KEY,
    order_id BIGINT NOT NULL,
    date_id INTEGER,
    customer_id INTEGER NOT NULL,
    channel_id INTEGER NOT NULL,
    location_id INTEGER,
    carrier VARCHAR(40),
    tracking_number VARCHAR(60),
    shipment_status VARCHAR(20) NOT NULL
        CHECK (shipment_status IN (
            'READY',
            'SHIPPED',
            'DELIVERED',
            'CANCELLED'
        )),
    shipped_at TIMESTAMP,
    delivered_at TIMESTAMP,

    FOREIGN KEY (date_id)
        REFERENCES dim_date(date_id),
    FOREIGN KEY (customer_id)
        REFERENCES dim_customer(customer_id),
    FOREIGN KEY (channel_id)
        REFERENCES dim_channel(channel_id),
    FOREIGN KEY (location_id)
        REFERENCES dim_location(location_id)
);

INSERT INTO fact_shipment (
    shipment_id,
    order_id,
    date_id,
    customer_id,
    channel_id,
    location_id,
    carrier,
    tracking_number,
    shipment_status,
    shipped_at,
    delivered_at
)
SELECT
    s.shipment_id,
    s.order_id,
    CASE
        WHEN s.shipped_at IS NOT NULL
        THEN CAST(STRFTIME(s.shipped_at, '%Y%m%d') AS INTEGER)
        ELSE NULL
    END,
    o.customer_id,
    o.channel_id,
    o.shipping_address_id,
    s.carrier,
    s.tracking_number,
    s.status,
    s.shipped_at,
    s.delivered_at
FROM raw.shipment s
INNER JOIN raw.sales_order o
    ON s.order_id = o.order_id;

-- ============================================
-- FACT_WEB_SESSION
-- Granularidad: una fila por sesion web
-- ============================================

CREATE TABLE fact_web_session (
    session_id BIGINT NOT NULL PRIMARY KEY,
    customer_id INTEGER,
    date_id INTEGER NOT NULL,
    started_at TIMESTAMP NOT NULL,
    ended_at TIMESTAMP,
    source VARCHAR(50),
    device VARCHAR(30),
    duration_seconds BIGINT,

    FOREIGN KEY (customer_id)
        REFERENCES dim_customer(customer_id),

    FOREIGN KEY (date_id)
        REFERENCES dim_date(date_id)
);
INSERT INTO fact_web_session (
    session_id,
    customer_id,
    date_id,
    started_at,
    ended_at,
    source,
    device,
    duration_seconds
)
SELECT
    session_id,
    customer_id,
    CAST(STRFTIME(started_at, '%Y%m%d') AS INTEGER),
    started_at,
    ended_at,
    source,
    device,
    CASE
        WHEN ended_at IS NOT NULL
        THEN DATE_DIFF('second', started_at, ended_at)
        ELSE NULL
    END
FROM raw.web_session;

-- ============================================
-- FACT_NPS
-- Granularidad: una fila por respuesta NPS
-- ============================================

CREATE TABLE fact_nps (
    nps_id BIGINT NOT NULL PRIMARY KEY,
    customer_id INTEGER,
    channel_id INTEGER NOT NULL,
    date_id INTEGER NOT NULL,
    score SMALLINT NOT NULL
        CHECK (score BETWEEN 0 AND 10),
    comment TEXT,
    responded_at TIMESTAMP NOT NULL,
    nps_category VARCHAR(20) NOT NULL,

    FOREIGN KEY (customer_id)
        REFERENCES dim_customer(customer_id),

    FOREIGN KEY (channel_id)
        REFERENCES dim_channel(channel_id),

    FOREIGN KEY (date_id)
        REFERENCES dim_date(date_id)
);
INSERT INTO fact_nps (
    nps_id,
    customer_id,
    channel_id,
    date_id,
    score,
    comment,
    responded_at,
    nps_category
)
SELECT
    nps_id,
    customer_id,
    channel_id,
    CAST(STRFTIME(responded_at, '%Y%m%d') AS INTEGER),
    score,
    comment,
    responded_at,
    CASE
        WHEN score >= 9 THEN 'PROMOTER'
        WHEN score >= 7 THEN 'PASSIVE'
        ELSE 'DETRACTOR'
    END
FROM raw.nps_response;