# EcoBottle AR — Arquitectura de Data Marts deprecada

## 1. Descripción

Esta rama conserva una versión anterior de la arquitectura analítica desarrollada para el trabajo práctico final de Marketing de EcoBottle AR.

En esta implementación se construyeron **ocho Data Marts**, separando los indicadores diarios y mensuales correspondientes a ventas, productos, actividad web y satisfacción del cliente (NPS).

La arquitectura fue implementada, pero posteriormente se decidió reemplazarla por una estructura simplificada de **cuatro Data Marts con granularidad diaria**, disponible en la rama `main`.

## 2. Arquitectura original

El diseño inicial contemplaba los siguientes Data Marts:

| Área de análisis | Data Mart diario | Data Mart mensual |
|---|---|---|
| Ventas | `mart_sales_daily` | `mart_sales_monthly` |
| Productos | `mart_products_daily` | `mart_products_monthly` |
| Actividad web | `mart_web_activity_daily` | `mart_web_activity_monthly` |
| Satisfacción del cliente | `mart_nps_daily` | `mart_nps_monthly` |

**Objetivo del diseño:** calcular previamente los indicadores mediante SQL y ofrecer tablas específicas para cada nivel temporal de análisis, reduciendo la necesidad de realizar cálculos en Power BI.

Los Data Marts mensuales permiten consultar directamente indicadores como el ticket promedio mensual, los clientes identificados activos del mes y el NPS mensual.

## 3. Motivos de la deprecación

Durante el desarrollo del dashboard de Power BI se identificaron limitaciones asociadas a esta arquitectura.

### Mayor complejidad en los filtros

El dashboard combina indicadores generales con gráficos de evolución temporal.

Utilizar tablas diferentes para los indicadores mensuales y los gráficos diarios hacía más compleja la configuración de relaciones y filtros compartidos, sin realizar medidas DAX o transformaciones extras en Power BI.

### Mantenimiento de los indicadores

La existencia de dos granularidades requería mantener y validar consultas adicionales, especialmente para indicadores no aditivos como el ticket promedio, los usuarios activos estimados y el NPS.

Estos indicadores no deben agregarse mediante sumas o promedios simples entre períodos.

## 4. Arquitectura definitiva

Como resultado de esta evaluación, se decidió implementar en la rama `main` cuatro Data Marts:

- `mart_sales`
- `mart_products`
- `mart_web_activity`
- `mart_nps`

Estos conservan granularidad diaria y permiten realizar análisis por diferentes períodos desde Power BI.

Para los indicadores que requieren un cálculo específico según los filtros seleccionados, se utilizan únicamente tres medidas DAX: **Ticket promedio, Usuarios activos y NPS**.

Esta decisión permite reducir las estructuras mantenidas sin perder la capacidad de análisis temporal necesaria para el dashboard.

## 5. Validación de la versión deprecada

Antes de descartar la arquitectura como solución definitiva, se ejecutaron consultas para comprobar la consistencia entre las tablas de hechos y los Data Marts diarios y mensuales.

Entre los controles realizados se verificó:

- Coincidencia de pedidos válidos y facturación.
- Coincidencia de unidades y facturación de productos.
- Conservación del total de sesiones web y sesiones anónimas.
- Consistencia del cálculo de usuarios activos estimados por mes.
- Coincidencia de respuestas y NPS global.
- Ausencia de registros duplicados según la granularidad definida para cada Data Mart.

Las validaciones ejecutadas no identificaron diferencias en estos controles.

Por lo tanto, **la arquitectura no se deprecó debido a errores en los datos o en sus cálculos**, sino por una decisión de simplificación y mantenimiento del modelo analítico.

## 6. Estado del proyecto

Esta rama se conserva únicamente como documentación de una alternativa de diseño implementada durante el desarrollo del proyecto.

**La versión definitiva, utilizada para el dashboard y la entrega del trabajo práctico, se encuentra en la rama `main`.**