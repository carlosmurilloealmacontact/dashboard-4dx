"use client"

import { useEffect, useState } from "react"
import { TODOS_MODULOS } from "@/lib/modulos"
import type { ModuloPanel, Secundario } from "@/lib/panelControl"
import { semanaAnterior, semanaSiguiente } from "@/lib/semana"

interface PracticaRollup {
  pct: number | null
  pctAnterior: number | null
  peso: number
  meta: number | null
  metaInvertida?: boolean
  metaTexto?: string
  secundario?: Secundario
}

interface CoordinadorRollup {
  coordinador: string
  servicio: string
  supervisores: number
  practicas: Record<ModuloPanel, PracticaRollup>
}

interface PanelControlData {
  semanaActual: string
  semanaAnterior: string
  semanaActualReal: string
  global: Record<ModuloPanel, PracticaRollup>
  porCoordinador: CoordinadorRollup[]
}

const ORDEN: ModuloPanel[] = ["adherencia", "practicas_lideres", "adherencia_pca", "compromisos", "quiz", "resolutividad", "pausas_4dx", "feedback"]

const ROLLUP_VACIO: PracticaRollup = { pct: null, pctAnterior: null, peso: 0, meta: null }

// Para los módulos donde el % principal es solo UNA de varias métricas que
// conviven bajo el mismo nombre (Resolutividad tiene Implementación y Backlog;
// Pausas 4DX tiene Diálogo y CDR), se deja explícito cuál es el número
// principal — si no, el título genérico del módulo no aclara cuál de las dos
// se está mostrando arriba.
const SUBLABEL: Partial<Record<ModuloPanel, string>> = {
  resolutividad: "% Implementación",
  pausas_4dx: "Diálogo",
}

function tituloModulo(id: ModuloPanel): string {
  return TODOS_MODULOS.find(m => m.id === id)?.titulo ?? id
}

// Mismo criterio que lib/panelControl.ts (tono): si hay meta variable, colorear
// contra esa meta en vez de umbrales fijos — evita que Resolutividad (meta ~23%)
// se vea "en rojo" estando al nivel esperado.
function tono(pct: number | null, meta: number | null | undefined, metaInvertida?: boolean): "ok" | "warn" | "bad" | "neutral" {
  if (pct == null) return "neutral"
  if (metaInvertida && meta != null) {
    if (pct <= meta) return "ok"
    if (pct <= meta * 1.5) return "warn"
    return "bad"
  }
  if (meta != null && meta !== 100) {
    const ratio = meta > 0 ? pct / meta : (pct > 0 ? 1 : 0)
    if (ratio >= 1) return "ok"
    if (ratio >= 0.7) return "warn"
    return "bad"
  }
  if (pct >= 80) return "ok"
  if (pct >= 50) return "warn"
  return "bad"
}

const DOT: Record<string, string> = { ok: "bg-green-500", warn: "bg-yellow-500", bad: "bg-red-500", neutral: "bg-gray-300" }
const CELDA: Record<string, string> = {
  ok: "bg-green-50 text-green-700",
  warn: "bg-yellow-50 text-yellow-700",
  bad: "bg-red-50 text-red-700",
  neutral: "bg-gray-50 text-gray-400",
}
const TEXTO_SECUNDARIO: Record<string, string> = {
  ok: "text-green-600", warn: "text-amber-600", bad: "text-red-600", neutral: "text-gray-500",
}

function metaLabel(r: PracticaRollup): string {
  if (r.metaTexto) return `meta: ${r.metaTexto}`
  if (r.meta == null) return ""
  return r.metaInvertida ? `meta ≤${r.meta}%` : `meta ${r.meta}%`
}

function Tendencia({ actual, anterior }: { actual: number | null; anterior: number | null }) {
  if (actual == null || anterior == null) return <span className="text-gray-400">sin comparación</span>
  const delta = actual - anterior
  if (delta === 0) return <span className="text-gray-500">sin cambio</span>
  const sube = delta > 0
  return (
    <span className={sube ? "text-green-600" : "text-red-600"}>
      {sube ? "▲" : "▼"} {Math.abs(delta)} pts vs. sem. pasada
    </span>
  )
}

export default function PanelControlAdmin() {
  const [semana, setSemana] = useState<string | null>(null)
  const [data, setData] = useState<PanelControlData | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let activo = true
    async function cargar() {
      setCargando(true)
      try {
        const url = semana ? `/api/admin/panel-control?semana=${semana}` : "/api/admin/panel-control"
        const r = await fetch(url)
        const d = await r.json()
        if (!activo) return
        if (d.error) {
          setError(d.error)
        } else {
          setData(d)
          setError("")
        }
      } catch (e) {
        if (activo) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (activo) setCargando(false)
      }
    }
    cargar()
    return () => { activo = false }
  }, [semana])

  const enSemanaReal = data ? Number(data.semanaActual) >= Number(data.semanaActualReal) : false

  return (
    <div className="mb-8 bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Panel de Control</h4>
          <p className="text-xs text-gray-600">Resumen de toda la operación por semana, antes de filtrar por persona.</p>
        </div>
        {data && (
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <button
              className="border border-gray-300 rounded-md px-2 py-1 hover:bg-gray-50"
              onClick={() => setSemana(semanaAnterior(data.semanaActual))}
            >
              ‹
            </button>
            <span>Semana {data.semanaActual}</span>
            <button
              className="border border-gray-300 rounded-md px-2 py-1 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={() => setSemana(semanaSiguiente(data.semanaActual))}
              disabled={enSemanaReal}
              title={enSemanaReal ? "Todavía no hay datos de semanas futuras" : undefined}
            >
              ›
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-red-600 text-xs mb-3">Error al cargar el panel: {error}</p>}
      {cargando && !error && <p className="text-gray-500 text-xs mb-3">Cargando panel de control...</p>}

      {data && (
        <>
          {/* KPI cards globales */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
            {ORDEN.map(mod => {
              const r = data.global[mod] ?? ROLLUP_VACIO
              const t = tono(r.pct, r.meta, r.metaInvertida)
              const meta = metaLabel(r)
              return (
                <div key={mod} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${DOT[t]}`} />
                    <span className="text-xs text-gray-600">{tituloModulo(mod)}</span>
                  </div>
                  {SUBLABEL[mod] && <p className="text-[11px] font-medium text-gray-500">{SUBLABEL[mod]}</p>}
                  <p className="text-2xl font-semibold text-gray-900">{r.pct != null ? `${r.pct}%` : "—"}</p>
                  {meta && <p className="text-[11px] text-gray-500 mt-0.5">{meta}</p>}
                  <p className="text-[11px] mt-1">
                    <Tendencia actual={r.pct} anterior={r.pctAnterior} />
                  </p>
                  {r.secundario && (
                    <p className={`text-[11px] mt-1 pt-1 border-t border-gray-200 ${TEXTO_SECUNDARIO[r.secundario.tono]}`}>
                      {r.secundario.label}: {r.secundario.texto}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Heatmap por coordinador */}
          {data.porCoordinador.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="text-left font-medium text-gray-600 px-2 py-1.5 border-b border-gray-200">Coordinador</th>
                    {ORDEN.map(mod => (
                      <th key={mod} className="text-center font-medium text-gray-600 px-2 py-1.5 border-b border-gray-200 whitespace-nowrap">
                        {tituloModulo(mod)}
                        {SUBLABEL[mod] && <span className="block font-normal text-gray-400">{SUBLABEL[mod]}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.porCoordinador.map(fila => (
                    <tr key={fila.coordinador}>
                      <td className="px-2 py-1.5 border-b border-gray-100 text-gray-900">
                        {fila.coordinador}
                        <span className="text-gray-400"> · {fila.supervisores} líder(es)</span>
                      </td>
                      {ORDEN.map(mod => {
                        const r = fila.practicas[mod] ?? ROLLUP_VACIO
                        const t = tono(r.pct, r.meta, r.metaInvertida)
                        return (
                          <td key={mod} className="px-1 py-1.5 border-b border-gray-100 text-center align-top">
                            <span className={`inline-block w-full rounded px-2 py-1 font-medium ${CELDA[t]}`}>
                              {r.pct != null ? `${r.pct}%` : "—"}
                            </span>
                            {r.secundario && (
                              <span className="block text-[10px] text-gray-500 mt-0.5">
                                {r.secundario.label}: {r.secundario.texto}
                              </span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex gap-4 mt-3 text-[11px] text-gray-500 flex-wrap">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-50 border border-green-200" />cumple meta</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-yellow-50 border border-yellow-200" />cerca de la meta</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-50 border border-red-200" />lejos de la meta</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-gray-50 border border-gray-200" />sin datos</span>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-xs">No se encontraron coordinadores para esta semana.</p>
          )}
        </>
      )}
    </div>
  )
}
