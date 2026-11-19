# 00 · Bitácora de decisiones

Resumen de la conversación previa (otro asistente), con la revisión hecha el 12-nov-2026.

| # | Decisión | Razón | Estado / revisión |
|---|---|---|---|
| D1 | Producir solo las etapas **crecimiento/finalización**, en **harina** | El iniciador (0–10 d) se vende peletizado/migajas. La peletizadora cuesta más, gasta más energía y complica la planta. | ✅ Se mantiene. Ver riesgos de mercado en [01](01_modelo_de_negocio.md). |
| D2 | **Sin torta de palmiste** en pollo | Decisión del promotor (fibra alta, baja digestibilidad en aves) | ✅ Se mantiene para pollo. Es una **oportunidad para ganado** ([06](06_oportunidades_mejora.md)). |
| D3 | Base: maíz + soya 46 + aceite crudo de palma + aminoácidos sintéticos + premix | Es la dieta estándar, la más fácil de fabricar y de abastecer | ✅ |
| D4 | Aceite crudo de palma de la extractora: acidez < 3,5 %, humedad e impurezas en norma | Fedepalma reporta 2,5–3,5 % de AGL como normal | ✅ Pedir además **índice de peróxidos** por lote. |
| D5 | **No** agregar antioxidante al aceite si es fresco | Trae 500–700 ppm de carotenos y 600–1.000 ppm de tocoferoles/tocotrienoles | ✅ Para el aceite. **Sí** para el alimento terminado si se almacena más de 2 semanas (incluido en la fórmula base, 125 g/t). |
| D6 | Requerimientos: **Ross 308, Especificaciones de Nutrición 2022, Tabla 2** | Es la línea genética de referencia | ✅ **Verificado contra el PDF** ([referencias](referencias/Ross-BroilerNutritionSpecifications2022-ES.pdf)). |
| D7 | F1 = "Crecimiento" Ross, usado d21–28; F2 = "Finalizador 1", d29–sacrificio | División propuesta, no de Ross | 🟡 Se propone lanzar con **un solo SKU** al inicio ([02](02_producto_y_formulacion.md)). |
| D8 | Valores de referencia para la matriz hasta tener análisis | Aún no hay laboratorio | ✅ La matriz está en `modelo/datos/ingredientes.json`. |
| D9 | Vitamina E del premix completa, sin descontar la del aceite | Ross la pide como vitamina adicional | ✅ |

## Correcciones de esta revisión

1. **Fórmulas del chat con la matriz actual:** quedan cortas en **fósforo disponible (≈ 94 %)**, **valina (≈ 95 %)**, isoleucina (96–98 %) y colina (97 %). Se re-optimizaron cumpliendo el 100 % de Ross. Esto añade unos 0,1–0,3 kg/t de L-valina, algo más de soya y fosfato, y **menos aceite (≈ 4,0 %)**.
2. **Color de la piel:** el pollo deposita sobre todo **xantofilas** (luteína, zeaxantina), no betacaroteno, que en buena parte se convierte en vitamina A. El aceite rojo probablemente tiñe poco. Igual se mantiene la prueba en un lote piloto.
3. **Volumen:** el lote de 500 aves (≈ 1,5 t) es muy poco para una planta. El punto de equilibrio está cerca de 50 t/mes. Esto cambia el enfoque del negocio ([01](01_modelo_de_negocio.md)).
4. **Temas que faltaban:** micotoxinas del maíz, anticoccidial y tiempo de retiro, registro ICA, manejo del aceite (es semisólido a temperatura ambiente) y granulometría de la harina.

## Preguntas abiertas para el promotor

- ¿Dónde está la extractora y qué relación hay con ella (propia, familiar, proveedor)? ¿A qué precio y en qué volumen entrega el aceite?
- ¿El negocio es solo para el hermano (autoconsumo) o para vender a terceros desde el inicio?
- ¿Hay un lote o bodega disponible? ¿Tiene energía trifásica?
- ¿Qué línea genética y qué peso de sacrificio maneja el hermano? ¿Qué concentrado usa hoy y a qué precio?
