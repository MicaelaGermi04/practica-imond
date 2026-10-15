# Modelo estrella

Generado por `run_sql.py` a partir de las tablas de `warehouse.duckdb`.

```mermaid
erDiagram
    dim_channel ||--o{ fact_nps : "channel_id"
    dim_channel ||--o{ fact_payment : "channel_id"
    dim_channel ||--o{ fact_sales : "channel_id"
    dim_channel ||--o{ fact_sales_item : "channel_id"
    dim_channel ||--o{ fact_shipment : "channel_id"
    dim_customer ||--o{ fact_nps : "customer_id"
    dim_customer ||--o{ fact_payment : "customer_id"
    dim_customer ||--o{ fact_sales : "customer_id"
    dim_customer ||--o{ fact_shipment : "customer_id"
    dim_customer ||--o{ fact_web_session : "customer_id"
    dim_date ||--o{ fact_nps : "date_id"
    dim_date ||--o{ fact_payment : "date_id"
    dim_date ||--o{ fact_sales : "date_id"
    dim_date ||--o{ fact_sales_item : "date_id"
    dim_date ||--o{ fact_shipment : "date_id"
    dim_date ||--o{ fact_web_session : "date_id"
    dim_location ||--o{ fact_sales : "location_id"
    dim_location ||--o{ fact_sales_item : "location_id"
    dim_location ||--o{ fact_shipment : "location_id"
    dim_product ||--o{ fact_sales_item : "product_key"
    dim_store ||--o{ fact_sales : "store_id"
    dim_channel {
        INTEGER channel_id PK
        VARCHAR code
        VARCHAR name
    }
    dim_customer {
        INTEGER customer_id PK
        VARCHAR email
        VARCHAR first_name
        VARCHAR last_name
        VARCHAR phone
        VARCHAR status
        TIMESTAMP created_at
    }
    dim_date {
        INTEGER date_id PK
        DATE full_date
        INTEGER day
        INTEGER month
        INTEGER year
        INTEGER quarter
    }
    dim_location {
        INTEGER location_id PK
        VARCHAR address_line
        VARCHAR city
        VARCHAR province_name
        VARCHAR province_code
        VARCHAR postal_code
        VARCHAR country_code
    }
    dim_product {
        INTEGER product_key PK
        INTEGER product_id
        VARCHAR sku
        VARCHAR name
        VARCHAR category
        VARCHAR family
        DECIMAL list_price
    }
    dim_store {
        INTEGER store_id PK
        VARCHAR store_name
        INTEGER address_id
        VARCHAR city
        VARCHAR province_name
    }
    fact_nps {
        BIGINT nps_id PK
        INTEGER customer_id FK
        INTEGER channel_id FK
        INTEGER date_id FK
        SMALLINT score
        VARCHAR comment
        TIMESTAMP responded_at
        VARCHAR nps_category
    }
    fact_payment {
        BIGINT payment_id PK
        BIGINT order_id
        INTEGER date_id FK
        INTEGER customer_id FK
        INTEGER channel_id FK
        VARCHAR payment_method
        VARCHAR payment_status
        DECIMAL amount
        TIMESTAMP paid_at
        VARCHAR transaction_ref
    }
    fact_sales {
        BIGINT order_id PK
        INTEGER date_id FK
        INTEGER customer_id FK
        INTEGER channel_id FK
        INTEGER location_id FK
        INTEGER store_id FK
        TIMESTAMP order_date
        VARCHAR status
        VARCHAR currency_code
        DECIMAL subtotal
        DECIMAL tax_amount
        DECIMAL shipping_fee
        DECIMAL total_amount
    }
    fact_sales_item {
        BIGINT order_item_id PK
        BIGINT order_id
        INTEGER date_id FK
        INTEGER product_key FK
        INTEGER channel_id FK
        VARCHAR order_status
        INTEGER quantity
        DECIMAL unit_price
        DECIMAL discount_amount
        DECIMAL line_total
        INTEGER location_id FK
    }
    fact_shipment {
        BIGINT shipment_id PK
        BIGINT order_id
        INTEGER date_id FK
        INTEGER customer_id FK
        INTEGER channel_id FK
        INTEGER location_id FK
        VARCHAR carrier
        VARCHAR tracking_number
        VARCHAR shipment_status
        TIMESTAMP shipped_at
        TIMESTAMP delivered_at
    }
    fact_web_session {
        BIGINT session_id PK
        INTEGER customer_id FK
        INTEGER date_id FK
        TIMESTAMP started_at
        TIMESTAMP ended_at
        VARCHAR source
        VARCHAR device
        BIGINT duration_seconds
    }
```
