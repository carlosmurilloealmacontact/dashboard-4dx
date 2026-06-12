// Construye el HTML del correo del Informe IA, con las gráficas
// representadas como tablas HTML (compatibles con Gmail/Outlook, sin
// imágenes ni adjuntos) para que se vean embebidas en el cuerpo del correo
// tal como aparecen en el dashboard.

import type { DatosInforme } from "@/lib/informes"
import {
  ORDEN_SECCIONES, SECCIONES_GRAFICA, COLORES, dividirSecciones, dataAgendaLider,
  type ResultadoInforme, type FilaGrafica, type SerieBarra,
} from "@/lib/informe-render"

function escapeHtml(s: string): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// Convierte el subset de Markdown que devuelve la IA (**negrita**) a HTML.
function renderInlineHtml(s: string): string {
  return escapeHtml(s).split(/(\*\*[^*]+\*\*)/g).map(parte =>
    parte.startsWith("**") && parte.endsWith("**")
      ? `<strong>${parte.slice(2, -2)}</strong>`
      : parte
  ).join("")
}

function renderLineasHtml(lineas: string[]): string {
  let html = ""
  let enLista = false
  for (const linea of lineas) {
    const t = linea.trim()
    if (t.startsWith("- ")) {
      if (!enLista) { html += '<ul style="margin:4px 0 8px 18px;padding:0;">'; enLista = true }
      html += `<li style="font-size:13px;line-height:1.5;color:#374151;margin-bottom:2px;">${renderInlineHtml(t.slice(2))}</li>`
      continue
    }
    if (enLista) { html += "</ul>"; enLista = false }
    if (!t) continue
    html += `<p style="font-size:13px;line-height:1.5;color:#374151;margin:4px 0;">${renderInlineHtml(linea)}</p>`
  }
  if (enLista) html += "</ul>"
  return html
}

// ── Barras como tablas HTML ─────────────────────────────────────────────

function segmentoBarra(anchoPct: number, color: string, texto: string): string {
  const ancho = Math.max(0, Math.min(100, Math.round(anchoPct)))
  if (ancho === 0) return ""
  return `<td bgcolor="${color}" style="background-color:${color};height:16px;font-size:10px;color:#ffffff;text-align:center;vertical-align:middle;border-radius:3px;" width="${ancho}%">${texto ? `&nbsp;${escapeHtml(texto)}&nbsp;` : "&nbsp;"}</td>`
}

function relleno(anchoPct: number): string {
  const ancho = Math.max(0, Math.min(100, Math.round(anchoPct)))
  if (ancho === 0) return ""
  return `<td bgcolor="#e5e7eb" style="background-color:#e5e7eb;height:16px;border-radius:3px;" width="${ancho}%">&nbsp;</td>`
}

function filaBarraUnica(label: string, valor: number, maxValor: number, color: string, unit: string | undefined): string {
  const pct = maxValor > 0 ? (valor / maxValor) * 100 : 0
  const texto = `${valor}${unit ?? ""}`
  return `
    <tr>
      <td style="font-size:11px;color:#374151;padding:2px 8px 2px 0;width:110px;white-space:nowrap;">${escapeHtml(label)}</td>
      <td style="padding:2px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          ${segmentoBarra(pct, color, texto)}${relleno(100 - pct)}
        </tr></table>
      </td>
    </tr>`
}

// Gráfica de barras agrupadas (una barra por serie) o apiladas (segmentos en una sola barra).
function tablaBarras(data: FilaGrafica[], series: SerieBarra[], stacked: boolean, domain: [number, number] | undefined, unit: string | undefined): string {
  if (data.length === 0) return ""

  if (!stacked) {
    const maxValor = domain ? domain[1] : Math.max(1, ...data.flatMap(d => series.map(s => Number(d[s.key]) || 0)))
    const filas = data.map(d => {
      const nombreFila = `<tr><td colspan="2" style="font-size:12px;font-weight:600;color:#111827;padding-top:8px;">${escapeHtml(String(d.supervisor ?? ""))}</td></tr>`
      const barras = series.map(s => filaBarraUnica(s.name, Number(d[s.key]) || 0, maxValor, s.color, unit)).join("")
      return nombreFila + barras
    }).join("")
    return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:6px 0 12px;">${filas}</table>`
  }

  // Apiladas: el ancho de cada barra es proporcional al total de esa fila
  // sobre el total máximo entre todas las filas.
  const totales = data.map(d => series.reduce((acc, s) => acc + (Number(d[s.key]) || 0), 0))
  const maxTotal = Math.max(1, ...totales)
  const filas = data.map((d, i) => {
    const total = totales[i]
    const anchoTotal = (total / maxTotal) * 100
    const segmentos = series.map(s => {
      const valor = Number(d[s.key]) || 0
      if (valor === 0) return ""
      const anchoSegmento = (valor / maxTotal) * 100
      return segmentoBarra(anchoSegmento, s.color, String(valor))
    }).join("")
    return `
      <tr><td colspan="2" style="font-size:12px;font-weight:600;color:#111827;padding-top:8px;">${escapeHtml(String(d.supervisor ?? ""))}</td></tr>
      <tr>
        <td style="padding:2px 0;" colspan="2">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
            ${segmentos}${relleno(100 - anchoTotal)}
          </tr></table>
        </td>
      </tr>`
  }).join("")
  const leyenda = series.map(s =>
    `<span style="display:inline-block;margin-right:10px;font-size:10px;color:#6b7280;"><span style="display:inline-block;width:8px;height:8px;background-color:${s.color};border-radius:2px;margin-right:3px;"></span>${escapeHtml(s.name)}</span>`
  ).join("")
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:6px 0 4px;">${filas}</table><div style="margin:0 0 12px;">${leyenda}</div>`
}

function graficaAgendaHtml(datos: DatosInforme): string {
  const data = dataAgendaLider(datos)
  if (data.length === 0) return ""
  const maxValor = Math.max(10, ...data.map(d => d.dias))
  const filas = data.map(d =>
    filaBarraUnica(d.supervisor, d.dias, maxValor, d.dias > 7 ? COLORES.rojo : COLORES.verde, " d")
  ).join("")
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:6px 0 12px;"><tr><td colspan="2" style="font-size:11px;color:#6b7280;padding-bottom:4px;">Días sin actualizar (referencia: 7 días)</td></tr>${filas}</table>`
}

function graficaConfirmacionesHtml(datos: DatosInforme): string {
  const c = datos.confirmacionesCoordinador
  const pct = Math.max(0, Math.min(100, Math.round((c.totalEstaSemana / c.meta) * 100)))
  const color = c.cumpleMeta ? COLORES.verde : COLORES.ambar
  const ultimo = c.ultimoIngreso ? `<p style="font-size:11px;color:#6b7280;margin:4px 0 0;">Último registro: ${escapeHtml(c.ultimoIngreso)} (${c.diasDesdeUltimoIngreso} días)</p>` : ""
  return `
    <div style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin:6px 0 12px;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td style="font-size:12px;color:#6b7280;">Acompañamientos esta semana</td>
          <td style="font-size:12px;color:#111827;font-weight:600;text-align:right;">${c.totalEstaSemana} / ${c.meta}</td>
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:6px;"><tr>
        ${segmentoBarra(pct, color, "")}${relleno(100 - pct)}
      </tr></table>
      ${ultimo}
    </div>`
}

function graficaSeccionHtml(titulo: string, datos: DatosInforme): string {
  if (titulo === "Confirmaciones de Rol") return graficaConfirmacionesHtml(datos)
  if (titulo === "Agenda del líder") return graficaAgendaHtml(datos)
  const cfg = SECCIONES_GRAFICA[titulo]
  if (!cfg) return ""
  const data = cfg.dataFn(datos)
  return tablaBarras(data, cfg.series, cfg.stacked ?? false, cfg.domain, cfg.unit)
}

// ── Documento completo ──────────────────────────────────────────────────

export function construirCorreoInforme(resultado: ResultadoInforme): { asunto: string; html: string } {
  const secciones = dividirSecciones(resultado.texto)
  const tipoLabel = resultado.alcance.tipo === "supervisor" ? "Supervisor" : "Coordinador"
  const tipoInformeLabel = resultado.tipoInforme === "parcial" ? "Parcial" : "Cierre"
  const asunto = `Informe de cumplimiento — ${resultado.alcance.nombre} — Semana(s) ${resultado.semanas.join(", ")}`

  const cuerpo = ORDEN_SECCIONES.map(titulo => {
    const lineas = secciones.get(titulo)
    if (!lineas) return ""
    const grafica = graficaSeccionHtml(titulo, resultado.datos)
    const texto = renderLineasHtml(lineas)
    return `
      <tr><td>
        <h3 style="font-size:14px;font-weight:700;color:#111827;margin:18px 0 6px;">${escapeHtml(titulo)}</h3>
        ${grafica}
        ${texto}
      </td></tr>`
  }).join("")

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(asunto)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:16px;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:640px;background-color:#ffffff;border-radius:8px;padding:20px;">
          <tr><td>
            <h2 style="font-size:16px;font-weight:700;color:#111827;margin:0 0 4px;">📊 Informe de cumplimiento</h2>
            <p style="font-size:12px;color:#6b7280;margin:0 0 16px;">
              ${escapeHtml(tipoLabel)}: ${escapeHtml(resultado.alcance.nombre)} · Semana(s): ${escapeHtml(resultado.semanas.join(", "))} · ${escapeHtml(tipoInformeLabel)}
            </p>
          </td></tr>
          ${cuerpo}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { asunto, html }
}
