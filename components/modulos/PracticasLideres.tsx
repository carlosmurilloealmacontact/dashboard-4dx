"use client"

import { useEffect, useState } from "react"
import { usePerfilContext } from "@/context/PerfilContext"
import { useModuloUrl } from "@/hooks/useModuloUrl"
import { useModuloMetric } from "@/context/ModuloMetricContext"
import { useSemanaGlobal } from "@/context/SemanaGlobalContext"

interface ResumenSemana {
  totalDias: number
  diasCumplidos: number
  pct: number
  diasFaltantes: string[]
  cdr: number | null
  focoTop: { foco: string; veces: number } | null
}

interface SupervisorRow {
  supervisor: string
  totalDias: number
  cumplidos: number
  pct: number
  cdr: number | null
  dias?: { dia: number; cumple: boolean | null }[]
}

interface Data {
  modo: "supervisor" | "coordinador"
  semanas: string[]
  semanaActual: string
  kpi: { pct: number; cdr: number | null }
  registros?: { fecha: string; semana: string; cumple: string; cdr: string; foco: string }[]
  resumenSemana?: ResumenSemana
  porSupervisor?: SupervisorRow[]
}

function parseFecha(f: string): Date | null {
  if (!f) return null
  const p = f.split("/")
  if (p.length === 3) return new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]))
  return null
}

function colorPct(n: number) {
  if (n >= 80) return "text-green-400"
  if (n >= 60) return "text-yellow-400"
  return "text-red-400"
}

function barColor(n: number) {
  if (n >= 80) return "bg-green-500"
  if (n >= 60) return "bg-yellow-500"
  return "bg-red-500"
}

const DIAS_LABEL = ["", "Lun", "Mar", "Mié", "Jue", "Vie"]

export default function PracticasLideres() {
  const [data, setData] = useState<Data | null>(null)
  const [cargando, setCargando] = useState(true)
  const { semanaGlobal, reportWeeks } = useSemanaGlobal()
  const base = useModuloUrl("/api/modulos/practicas-lideres/test")
  const url = semanaGlobal ? `${base}${base.includes("?") ? "&" : "?"}semana=${semanaGlobal}` : base
  const { setMetric } = useModuloMetric()

  useEffect(() => {
    fetch(url).then(r => r.json()).then(d => {
      setData(d)
      if (Array.isArray(d.semanas)) reportWeeks("practicas-lideres", d.semanas)
      if (d.kpi) {
        setMetric({
          valor: `${d.kpi.pct}%`,
          alerta: d.kpi.cdr !== null && d.kpi.cdr < 80 ? 1 : 0,
          color: d.kpi.pct >= 80 ? "green" : d.kpi.pct >= 60 ? "yellow" : "red",
        })
      } else {
        setMetric({ valor: "—", color: "white" })
      }
    }).finally(() => setCargando(false))
  }, [url, setMetric, reportWeeks])

  if (cargando && !data) return <p className="text-xs text-gray-500 py-2">Cargando...</p>
  if (!data?.kpi) return <p className="text-xs text-gray-500 py-2">Sin registros.</p>

  const semanaActiva = data.semanaActual

  // ── VISTA COORDINADOR ──────────────────────────────────────────
  if (data.modo === "coordinador") {
    const supervisores = data.porSupervisor ?? []
    return (
      <div className="space-y-4">
        {/* KPI global */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-xs text-gray-400">Diálogo equipo</p>
            <p className={`text-2xl font-bold ${colorPct(data.kpi.pct)}`}>{data.kpi.pct}%</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-xs text-gray-400">CDR promedio</p>
            <p className={`text-2xl font-bold ${data.kpi.cdr !== null ? colorPct(data.kpi.cdr) : "text-gray-500"}`}>
              {data.kpi.cdr !== null ? `${data.kpi.cdr}%` : "—"}
            </p>
          </div>
        </div>

        {/* Por supervisor */}
        <div className="space-y-2">
          <p className="text-xs text-gray-500">Por supervisor — sem. {semanaActiva}</p>
          {supervisores.map((sv, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-3">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-gray-300 truncate max-w-[160px]">
                  {sv.supervisor.split(" ").slice(0, 3).join(" ")}
                </span>
                <div className="flex gap-2 items-center">
                  {sv.cdr !== null && (
                    <span className={`text-xs ${colorPct(sv.cdr)}`}>CDR {sv.cdr}%</span>
                  )}
                  <span className={`text-xs font-bold ${colorPct(sv.pct)}`}>{sv.pct}%</span>
                </div>
              </div>
              {sv.dias ? (
                <div className="flex gap-1 mt-2">
                  {sv.dias.map(({ dia, cumple }) => {
                    const color = cumple === null ? "bg-gray-700" : cumple ? "bg-green-500" : "bg-red-500"
                    return (
                      <div key={dia} className="flex-1 flex flex-col items-center gap-1">
                        <div className={`w-full h-4 rounded ${color}`} />
                        <span className="text-xs text-gray-600">{DIAS_LABEL[dia]}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full ${barColor(sv.pct)}`} style={{ width: `${sv.pct}%` }} />
                </div>
              )}
              <p className="text-xs text-gray-600 mt-1">{sv.cumplidos} de {sv.totalDias} días</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── VISTA SUPERVISOR ───────────────────────────────────────────
  const resumen = data.resumenSemana
  if (!resumen) return <p className="text-xs text-gray-500 py-2">Sin datos de la semana.</p>

  // Días de la semana desde los registros
  const registrosSemana = (data.registros ?? []).filter(r =>
    String(r.semana) === semanaActiva && (() => {
      const d = parseFecha(r.fecha)
      return d && d.getDay() >= 1 && d.getDay() <= 5
    })()
  )

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-400">Diálogo semana</p>
          <p className={`text-2xl font-bold ${colorPct(resumen.pct)}`}>{resumen.pct}%</p>
          <p className="text-xs text-gray-500">{resumen.diasCumplidos} de {resumen.totalDias} días</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-400">CDR Semanal</p>
          <p className={`text-2xl font-bold ${resumen.cdr !== null ? colorPct(resumen.cdr) : "text-gray-500"}`}>
            {resumen.cdr !== null ? `${resumen.cdr}%` : "—"}
          </p>
          <p className="text-xs text-gray-500">sem. {semanaActiva}</p>
        </div>
      </div>

      {/* Resumen: qué hizo y qué falta */}
      {resumen.diasFaltantes.length > 0 && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3">
          <p className="text-xs text-red-400 mb-1">⚠ Días sin diálogo esta semana</p>
          <div className="flex gap-2 flex-wrap">
            {resumen.diasFaltantes.map((f, i) => {
              const d = parseFecha(f)
              return (
                <span key={i} className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded">
                  {d ? DIAS_LABEL[d.getDay()] : f}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {resumen.diasFaltantes.length === 0 && resumen.totalDias > 0 && (
        <div className="bg-green-900/20 border border-green-800 rounded-lg p-3">
          <p className="text-xs text-green-400">✓ Diálogo completo esta semana</p>
        </div>
      )}

      {/* Barras Lun-Vie */}
      <div>
        <p className="text-xs text-gray-500 mb-2">Lun — Vie</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((numDia) => {
            const r = registrosSemana.find(reg => parseFecha(reg.fecha)?.getDay() === numDia)
            const color = !r ? "bg-gray-700" : r.cumple === "1" ? "bg-green-500" : "bg-red-500"
            return (
              <div key={numDia} className="flex-1 flex flex-col items-center gap-1">
                <div className={`w-full h-6 rounded ${color}`} />
                <span className="text-xs text-gray-600">{DIAS_LABEL[numDia]}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Foco más usado */}
      {resumen.focoTop && (
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-1">Foco más usado</p>
          <p className="text-sm text-white">{resumen.focoTop.foco}</p>
          <p className="text-xs text-gray-500">{resumen.focoTop.veces} {resumen.focoTop.veces === 1 ? "vez" : "veces"} esta semana</p>
        </div>
      )}
    </div>
  )
}



