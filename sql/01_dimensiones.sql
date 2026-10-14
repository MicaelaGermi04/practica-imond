-- =====================================================================
-- 01_dimensiones.sql — Tablas de DIMENSIONES del modelo estrella
-- =====================================================================
-- Para cada dimensión:
--   1. CREATE TABLE con sus columnas, tipos y PRIMARY KEY.
--   2. INSERT INTO ... SELECT para cargarla desde las tablas de origen.
--
-- Las tablas de origen (los CSV de raw/) están en el esquema raw:
--     FROM raw.product
-- Para ver qué columnas y tipos tiene una:  DESCRIBE raw.product;
-- Para explorarlas antes de escribir nada:  python run_sql.py --explorar
-- =====================================================================

-- ---------------------------------------------------------------------
-- EJEMPLO RESUELTO: dimensión producto
-- ---------------------------------------------------------------------
-- En raw/ la categoría está en otra tabla y tiene jerarquía
-- (Bottles -> Classic / Sport). En la dimensión la "aplanamos":
-- cada producto queda en una sola fila con su categoría y su familia.
--
-- product_key es la clave SUBROGADA: un número propio del data warehouse.
-- product_id es la clave NATURAL: el ID que viene del sistema de origen.
-- Las tablas de hechos usan product_key; product_id sirve para encontrarla.

CREATE TABLE dim_product (
    product_key INTEGER PRIMARY KEY,
    product_id  INTEGER NOT NULL,
    sku         VARCHAR NOT NULL,
    name        VARCHAR NOT NULL,
    category    VARCHAR,             -- Classic / Sport
    family      VARCHAR,             -- Bottles
    list_price  DECIMAL(12, 2)
);

INSERT INTO dim_product
SELECT
    ROW_NUMBER() OVER (ORDER BY p.product_id) AS product_key,
    p.product_id,
    p.sku,
    p.name,
    c.name AS category,
    f.name AS family,
    p.list_price
FROM raw.product AS p
LEFT JOIN raw.product_category AS c ON c.category_id = p.category_id   -- categoría
LEFT JOIN raw.product_category AS f ON f.category_id = c.parent_id;    -- familia (categoría padre)

-- ============================================
-- DIM_DATE
-- Granularidad: una fila por fecha
-- ============================================

CREATE TABLE dim_date (
    date_id INTEGER NOT NULL PRIMARY KEY,
    full_date DATE NOT NULL UNIQUE,
    day INTEGER,
    month INTEGER,
    year INTEGER,
    quarter INTEGER
);

INSERT INTO dim_date (
    date_id,
    full_date,
    day,
    month,
    year,
    quarter
)
SELECT
    CAST(STRFTIME(fecha, '%Y%m%d') AS INTEGER),
    CAST(fecha AS DATE),
    DAY(fecha),
    MONTH(fecha),
    YEAR(fecha),
    QUARTER(fecha)
FROM generate_series(
    DATE '2024-01-01',
    DATE '2025-09-30',
    INTERVAL 1 DAY
) AS calendario(fecha);


-- ============================================
-- DIM_CHANNEL
-- Granularidad: una fila por canal de venta
-- ============================================

CREATE TABLE dim_channel (
    channel_id INTEGER NOT NULL PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(50) NOT NULL
);

INSERT INTO dim_channel (
    channel_id,
    code,
    name
)
SELECT
    channel_id,
    code,
    name
FROM raw.channel;


-- ============================================
-- DIM_CUSTOMER
-- Granularidad: una fila por cliente
-- ============================================

CREATE TABLE dim_customer (
    customer_id INTEGER NOT NULL PRIMARY KEY,
    email VARCHAR(120) UNIQUE,
    first_name VARCHAR(80),
    last_name VARCHAR(80),
    phone VARCHAR(30),
    status CHAR(1) DEFAULT 'A'
        CHECK (status IN ('A', 'I')),
    created_at TIMESTAMP NOT NULL
);

INSERT INTO dim_customer (
    customer_id,
    email,
    first_name,
    last_name,
    phone,
    status,
    created_at
)
SELECT
    customer_id,
    email,
    first_name,
    last_name,
    phone,
    status,
    created_at
FROM raw.customer;


-- ============================================
-- DIM_LOCATION
-- Granularidad: una fila por dirección
-- ============================================

CREATE TABLE dim_location (
    location_id INTEGER NOT NULL PRIMARY KEY,
    address_line VARCHAR(120),
    city VARCHAR(80),
    province_name VARCHAR(50),
    province_code VARCHAR(10),
    postal_code VARCHAR(20),
    country_code CHAR(2)
);

INSERT INTO dim_location (
    location_id,
    address_line,
    city,
    province_name,
    province_code,
    postal_code,
    country_code
)
SELECT
    a.address_id,
    a.line1,
    a.city,
    p.name,
    p.code,
    a.postal_code,
    a.country_code
FROM raw.address a
LEFT JOIN raw.province p
    ON a.province_id = p.province_id;


-- ============================================
-- DIM_STORE
-- Granularidad: una fila por tienda física
-- ============================================

CREATE TABLE dim_store (
    store_id INTEGER NOT NULL PRIMARY KEY,
    store_name VARCHAR(80) NOT NULL,
    address_id INTEGER,
    city VARCHAR(80),
    province_name VARCHAR(50)
);

INSERT INTO dim_store (
    store_id,
    store_name,
    address_id,
    city,
    province_name
)
SELECT
    s.store_id,
    s.name,
    s.address_id,
    a.city,
    p.name
FROM raw.store s
LEFT JOIN raw.address a
    ON s.address_id = a.address_id
LEFT JOIN raw.province p
    ON a.province_id = p.province_id;
