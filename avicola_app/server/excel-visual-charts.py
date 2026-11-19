#!/usr/bin/env python3
"""
Post-procesador visual ejecutivo (siguiendo Anthropic xlsx & xlsx-author skills).
Inyecta gráficos nativos editables de Excel en AV-1 y AV-2 sin modificar celdas
ni fórmulas existentes.
"""

import sys
import openpyxl
from openpyxl.chart import BarChart, LineChart, Reference, Series
from openpyxl.chart.marker import Marker
from openpyxl.chart.shapes import GraphicalProperties
from openpyxl.drawing.line import LineProperties


def _soft_gridline():
    gp = GraphicalProperties()
    gp.line = LineProperties(solidFill="E2E8F0", w=6350)
    return gp


def _soft_axis_line():
    gp = GraphicalProperties()
    gp.line = LineProperties(solidFill="94A3B8", w=9525)
    return gp


def style_chart_common(chart, title, x_title="", y_title="", width=17.5, height=9.2):
    chart.title = title
    chart.style = 10
    chart.roundedCorners = False
    chart.width = width
    chart.height = height
    if chart.title:
        chart.title.overlay = False
    if chart.legend:
        chart.legend.overlay = False
        chart.legend.position = "b"
    if isinstance(chart, BarChart):
        chart.gapWidth = 95
        chart.overlap = -18
    if hasattr(chart, "x_axis") and chart.x_axis is not None:
        chart.x_axis.delete = False
        chart.x_axis.majorGridlines = None
        chart.x_axis.spPr = _soft_axis_line()
        if x_title:
            chart.x_axis.title = x_title
            chart.x_axis.title.overlay = False
    if hasattr(chart, "y_axis") and chart.y_axis is not None:
        chart.y_axis.delete = False
        chart.y_axis.spPr = _soft_axis_line()
        if chart.y_axis.majorGridlines is not None:
            chart.y_axis.majorGridlines.spPr = _soft_gridline()
        if y_title:
            chart.y_axis.title = y_title
            chart.y_axis.title.overlay = False


def add_row_series(chart, ws, row_idx, min_col, max_col, title_col, hex_color):
    vals = Reference(ws, min_col=min_col, max_col=max_col, min_row=row_idx)
    s = Series(vals, title=str(ws.cell(row=row_idx, column=title_col).value or ""))
    s.graphicalProperties.solidFill = hex_color
    s.graphicalProperties.line.solidFill = hex_color
    chart.series.append(s)


def find_row_containing(ws, col_idx, needle):
    for r in range(1, ws.max_row + 1):
        val = ws.cell(row=r, column=col_idx).value
        if isinstance(val, str) and needle in val:
            return r
    return None


def polish_av1(path):
    wb = openpyxl.load_workbook(path)
    if "0_Resumen_Ejecutivo" in wb.sheetnames:
        ws = wb["0_Resumen_Ejecutivo"]
        ws._charts.clear()

        # Gráfico 1: Comparativa Financiera por Escenario (encuadrado en tarjeta blanca H4:O20)
        c1 = BarChart()
        c1.type = "col"
        c1.grouping = "clustered"
        style_chart_common(c1, "", "", "COP", width=18.2, height=8.4)
        cats1 = Reference(ws, min_col=3, max_col=5, min_row=4)
        add_row_series(c1, ws, 11, 3, 5, 1, "475569")
        add_row_series(c1, ws, 15, 3, 5, 1, "1D4ED8")
        add_row_series(c1, ws, 16, 3, 5, 1, "059669")
        c1.set_categories(cats1)
        ws.add_chart(c1, "H6")

        # Gráfico 2: Matriz Precio x Mortalidad (encuadrado en tarjeta blanca H22:O36)
        c2 = BarChart()
        c2.type = "col"
        c2.grouping = "clustered"
        style_chart_common(
            c2,
            "",
            "Precio Canal (COP/kg)",
            "Utilidad Neta (COP)",
            width=18.2,
            height=8.4,
        )
        data2 = Reference(ws, min_col=3, max_col=5, min_row=22, max_row=26)
        cats2 = Reference(ws, min_col=1, min_row=23, max_row=26)
        c2.add_data(data2, titles_from_data=True)
        c2.set_categories(cats2)
        palette = ["059669", "D97706", "E11D48"]
        for idx, s in enumerate(c2.series):
            col = palette[idx % len(palette)]
            s.graphicalProperties.solidFill = col
            s.graphicalProperties.line.solidFill = col
        ws.add_chart(c2, "H24")

    wb.save(path)


def polish_av2(path):
    wb = openpyxl.load_workbook(path)

    if "0_Tablero_Gerencial" in wb.sheetnames:
        ws0 = wb["0_Tablero_Gerencial"]
        ws0._charts.clear()

        # Gráfico 1: Inversión vs Ingreso vs Utilidad Lote 1, 2 y 3 (encuadrado en H4:O24)
        c1 = BarChart()
        c1.type = "col"
        c1.grouping = "clustered"
        style_chart_common(c1, "", "", "COP", width=18.2, height=9.6)
        cats1 = Reference(ws0, min_col=2, max_col=4, min_row=28)
        add_row_series(c1, ws0, 34, 2, 4, 1, "475569")
        add_row_series(c1, ws0, 38, 2, 4, 1, "1D4ED8")
        add_row_series(c1, ws0, 39, 2, 4, 1, "059669")
        c1.set_categories(cats1)
        ws0.add_chart(c1, "H6")

        # Gráfico 2: Sensibilidad Consolidado 3 Lotes (encuadrado en H26:O47)
        c2 = BarChart()
        c2.type = "col"
        c2.grouping = "clustered"
        style_chart_common(
            c2,
            "",
            "Precio Canal (COP/kg)",
            "COP",
            width=18.2,
            height=9.8,
        )
        data2 = Reference(ws0, min_col=4, max_col=5, min_row=45, max_row=49)
        cats2 = Reference(ws0, min_col=1, min_row=46, max_row=49)
        c2.add_data(data2, titles_from_data=True)
        c2.set_categories(cats2)
        for idx, s in enumerate(c2.series):
            col = "059669" if idx == 0 else "0284C7"
            s.graphicalProperties.solidFill = col
            s.graphicalProperties.line.solidFill = col
        ws0.add_chart(c2, "H28")

    if "1_Plan_3_Lotes_y_Capacidad" in wb.sheetnames:
        ws1 = wb["1_Plan_3_Lotes_y_Capacidad"]
        ws1._charts.clear()

        c3 = LineChart()
        style_chart_common(
            c3,
            "",
            "",
            "Saldo Caja (COP)",
            width=18.5,
            height=8.4,
        )
        data3 = Reference(ws1, min_col=7, min_row=49, max_row=60)
        cats3 = Reference(ws1, min_col=1, min_row=50, max_row=60)
        c3.add_data(data3, titles_from_data=True)
        c3.set_categories(cats3)
        if c3.series:
            s0 = c3.series[0]
            s0.graphicalProperties.line.solidFill = "1D4ED8"
            s0.graphicalProperties.line.width = 28000
            s0.marker = Marker(symbol="circle", size=7)
            s0.marker.graphicalProperties.solidFill = "059669"
            s0.marker.graphicalProperties.line.solidFill = "1D4ED8"
        ws1.add_chart(c3, "I50")

    if "6_Viajes_Ventas_Minuta" in wb.sheetnames:
        ws6 = wb["6_Viajes_Ventas_Minuta"]
        ws6._charts.clear()

        # Gráfico 1 (encuadrado en I8:P26 -> ancla I10)
        curve_hdr = find_row_containing(ws6, 1, "Hito del Ciclo Lote 1")
        if curve_hdr:
            c4 = LineChart()
            style_chart_common(
                c4,
                "",
                "",
                "Peso Vivo (g/ave)",
                width=18.5,
                height=9.2,
            )
            data4 = Reference(ws6, min_col=3, min_row=curve_hdr, max_row=curve_hdr + 10)
            cats4 = Reference(ws6, min_col=2, min_row=curve_hdr + 1, max_row=curve_hdr + 10)
            c4.add_data(data4, titles_from_data=True)
            c4.set_categories(cats4)
            if c4.series:
                s = c4.series[0]
                s.graphicalProperties.line.solidFill = "0F766E"
                s.graphicalProperties.line.width = 28000
                s.marker = Marker(symbol="diamond", size=7)
                s.marker.graphicalProperties.solidFill = "F59E0B"
                s.marker.graphicalProperties.line.solidFill = "0F766E"
            ws6.add_chart(c4, "I10")

        # Gráfico 2 (encuadrado en I28:P46 -> ancla I30)
        mod_hdr = find_row_containing(ws6, 1, "Modalidad / Venta")
        if mod_hdr:
            c5 = BarChart()
            c5.type = "col"
            c5.grouping = "clustered"
            style_chart_common(
                c5,
                "",
                "",
                "COP",
                width=18.5,
                height=9.2,
            )
            data5 = Reference(ws6, min_col=4, max_col=6, min_row=mod_hdr, max_row=mod_hdr + 3)
            cats5 = Reference(ws6, min_col=1, min_row=mod_hdr + 1, max_row=mod_hdr + 3)
            c5.add_data(data5, titles_from_data=True)
            c5.set_categories(cats5)
            pal5 = ["1D4ED8", "64748B", "059669"]
            for idx, s in enumerate(c5.series):
                col = pal5[idx % len(pal5)]
                s.graphicalProperties.solidFill = col
                s.graphicalProperties.line.solidFill = col
            ws6.add_chart(c5, "I30")

        # Gráfico 3 (encuadrado en I48:P66 -> ancla I50): Bodega Solla JIT Comprado Hoy vs Por Comprar
        jit_hdr = find_row_containing(ws6, 1, "Etapa y Producto Solla")
        if jit_hdr:
            c6 = BarChart()
            c6.type = "col"
            c6.grouping = "stacked"
            c6.overlap = 100
            style_chart_common(
                c6,
                "",
                "",
                "Bultos (40 kg)",
                width=18.5,
                height=9.2,
            )
            data6_comp = Reference(ws6, min_col=3, min_row=jit_hdr, max_row=jit_hdr + 3)
            data6_pend = Reference(ws6, min_col=5, min_row=jit_hdr, max_row=jit_hdr + 3)
            cats6 = Reference(ws6, min_col=1, min_row=jit_hdr + 1, max_row=jit_hdr + 3)
            c6.add_data(data6_comp, titles_from_data=True)
            c6.add_data(data6_pend, titles_from_data=True)
            c6.set_categories(cats6)
            pal6 = ["059669", "F59E0B"]
            for idx, s in enumerate(c6.series):
                col = pal6[idx % len(pal6)]
                s.graphicalProperties.solidFill = col
                s.graphicalProperties.line.solidFill = col
            ws6.add_chart(c6, "I50")

    wb.save(path)


def main():
    if len(sys.argv) < 3:
        print("Usage: excel-visual-charts.py <AV1|AV2> <xlsx_path>", file=sys.stderr)
        sys.exit(2)
    kind = sys.argv[1].upper()
    target = sys.argv[2]
    if kind == "AV1":
        polish_av1(target)
    elif kind == "AV2":
        polish_av2(target)
    else:
        raise ValueError(f"Unknown kind: {kind}")


if __name__ == "__main__":
    main()
