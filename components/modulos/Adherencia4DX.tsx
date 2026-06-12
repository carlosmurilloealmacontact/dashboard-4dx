"use client"

import { useEffect, useState } from "react"
import { usePerfilContext } from "@/context/PerfilContext"
import { useModuloUrl } from "@/hooks/useModuloUrl"
import { useModuloMetric } from "@/context/ModuloMetricContext"
import { useSemanaGlobal } from "@/context/SemanaGlobalContext"

interface Registro {
  fecha: string
  semana: string
  bp: string
  nombre: string
  cumple: string
  jefe?: string
}

interface SupervisorResumen {
  supervisor: string
  totalAgentes: number
  pct: number
  conAlerta: number
  bpsAlerta: string[]
}

interface Data {
  modo: "supervisor" | "coordinador"
  semanas: string[]
  semanaActual: string
  kpi: { pct: number; alertas: number; bpsAlerta: string[] }
  registros: Registro[]
  supervisoresResumen?: SupervisorResumen[]
}

function parseCumple(v: string): number {
  return parseFloat((v ?? "").replace(",", ".")) || 0
}

function colorPct(n: number) {
  if (n >= 80) return "bg-green-500"
  if (n >= 50) return "bg-yellow-500"
  if (n > 0) return "bg-red-500"
  return "bg-gray-700"
}

function colorText(n: number): "green" | "yellow" | "red" {
  if (n >= 80) return "green"
  if (n >= 60) return "yellow"
  return "red"
}

const DIAS = [{ num: 1, label: "Lun" }, { num: 2, label: "Mar" }, { num: 3, label: "Mié" }, { num: 4, label: "Jue" }, { num: 5, label: "Vie" }]

function fechaDiaSemana(fecha: string): number | null {
  const [y, m, d] = (fecha ?? "").split("-")
  if (!y || !m || !d) return null
  return new Date(Number(y), Number(m) - 1, Number(d)).getDay()
}

// Promedio de cumplimiento por día (Lun-Vie) para un conjunto de registros
function GridDiasEquipo({ registros, semana }: { registros: Registro[]; semana: string }) {
  return (
    <div className="flex gap-1">
      {DIAS.map(d => {
        const delDia = registros.filter(r => String(r.semana) === semana && fechaDiaSemana(r.fecha) === d.num)
        const pct = delDia.length > 0
          ? Math.round((delDia.reduce((s, r) => s + parseCumple(r.cumple), 0) / delDia.length) * 100)
          : null
        return (
          <div key={d.num} className="flex-1 flex flex-col items-center gap-1">
            <div className={`w-full h-4 rounded ${pct === null ? "bg-gray-700" : colorPct(pct)}`} />
            <span className="text-xs text-gray-600">{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function Adherencia4DX() {
  const [data, setData] = useState<Data | null>(null)
  const [cargando, setCargando] = useState(true)
  const [supervisorDetalle, setSupervisorDetalle] = useState<string | null>(null)
  const { semanaGlobal, reportWeeks } = useSemanaGlobal()
  const base = useModuloUrl("/api/modulos/adherencia-4dx")
  const url = semanaGlobal ? `${base}${base.includes("?") ? "&" : "?"}semana=${semanaGlobal}` : base
  const { setMetric } = useModuloMetric()

  useEffect(() => {
    fetch(url).then(r => r.json()).then(d => {
      setData(d)
      if (Array.isArray(d.semanas)) reportWeeks("adherencia-4dx", d.semanas)
      if (d.kpi) {
        setMetric({
          valor: `${d.kpi.pct}%`,
          alerta: d.kpi.alertas,
          color: colorText(d.kpi.pct),
        })
      } else {
        setMetric({ valor: "—", color: "white" })
      }
    }).finally(() => setCargando(false))
  }, [url, setMetric, reportWeeks])

  if (cargando && !data) return <p className="text-xs text-gray-500 py-2">Cargando...</p>
  if (!data?.kpi || !data?.registros?.length) return <p className="text-xs text-gray-500 py-2">Sin registros.</p>

  const semanaActiva = data.semanaActual

  // ── VISTA COORDINADOR ──────────────────────────────────────────────
  if (data.modo === "coordinador") {
    const resumen = data.supervisoresResumen ?? []

    // Detalle de un supervisor específico
    if (supervisorDetalle) {
      const registrosSup = data.registros.filter(r =>
        (r.jefe ?? "").toLowerCase() === supervisorDetalle.toLowerCase() &&
        String(r.semana) === semanaActiva
      )
      const agentes = [...new Map(registrosSup.map(r => [r.bp, r])).values()]

      function getRegistro(bp: string, diaSemana: number) {
        return registrosSup.find(r => {
          if (r.bp !== bp || !r.fecha) return false
          const [y, m, d] = r.fecha.split("-")
          if (!y || !m || !d) return false
          const f = new Date(Number(y), Number(m) - 1, Number(d))
          return f.getDay() === diaSemana
        })
      }

      return (
        <div className="space-y-4">
          <button className="text-xs text-gray-500 hover:text-white" onClick={() => setSupervisorDetalle(null)}>
            ← Volver
          </button>
          <p className="text-xs text-white font-medium break-words">{supervisorDetalle}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left text-gray-500 font-normal pb-1 pr-2">Agente</th>
                  {DIAS.map(d => <th key={d.num} className="text-center text-gray-500 font-normal pb-1 px-1 w-8">{d.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {agentes.map(({ bp, nombre }) => {
                  const svData = data.supervisoresResumen?.find(s => s.supervisor.toLowerCase() === supervisorDetalle?.toLowerCase())
                  const tieneAlerta = (svData?.bpsAlerta ?? data.kpi.bpsAlerta ?? []).includes(bp)
                  return (
                    <tr key={bp}>
                      <td className={`py-1 pr-2 break-words ${tieneAlerta ? "text-red-400 font-medium" : "text-gray-300"}`}>
                        {tieneAlerta && <span className="mr-1">⚠</span>}
                        {nombre}
                      </td>
                      {DIAS.map(d => {
                        const r = getRegistro(bp, d.num)
                        return (
                          <td key={d.num} className="text-center py-1 px-1">
                            <div className={`w-5 h-5 rounded mx-auto ${r ? colorPct(parseCumple(r.cumple) * 100) : "bg-gray-700"}`} />
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block"/>Completo</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500 inline-block"/>Parcial</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block"/>No cumplió</span>
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs text-gray-500">Por supervisor — sem. {semanaActiva}</p>
          {resumen.map((sv, i) => (
            <button key={i} className="w-full bg-gray-800 rounded-lg p-3 text-left hover:border hover:border-gray-600"
              onClick={() => setSupervisorDetalle(sv.supervisor)}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-gray-300 break-words mr-2">{sv.supervisor}</span>
                <span className={`text-xs font-bold ${sv.pct >= 80 ? "text-green-400" : sv.pct >= 60 ? "text-yellow-400" : "text-red-400"}`}>{sv.pct}%</span>
              </div>
              <div className="flex-1 bg-gray-700 rounded-full h-1.5 mb-2">
                <div className={`h-1.5 rounded-full ${colorPct(sv.pct)}`} style={{ width: `${sv.pct}%` }} />
              </div>
              <GridDiasEquipo
                registros={data.registros.filter(r => (r.jefe ?? "").toLowerCase() === sv.supervisor.toLowerCase())}
                semana={semanaActiva}
              />
              <div className="flex gap-3 text-xs text-gray-600 mt-1">
                <span>{sv.totalAgentes} agentes</span>
                {sv.conAlerta > 0 && <span className="text-red-400">⚠ {sv.conAlerta} alertas</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── VISTA SUPERVISOR ───────────────────────────────────────────────
  const porSemana = data.registros.filter(r => String(r.semana) === semanaActiva)
  const agentes = [...new Map(porSemana.map(r => [r.bp, r])).values()]

  const totalRegistros = porSemana.length
  const cumplieron = porSemana.filter(r => parseCumple(r.cumple) >= 1).length
  const pct = totalRegistros > 0 ? Math.round((cumplieron / totalRegistros) * 100) : 0

  function getRegistro(bp: string, diaSemana: number) {
    return porSemana.find(r => {
      if (r.bp !== bp || !r.fecha) return false
      const [y, m, d] = r.fecha.split("-")
      if (!y || !m || !d) return false
      const f = new Date(Number(y), Number(m) - 1, Number(d))
      return f.getDay() === diaSemana
    })
  }

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 rounded-lg p-3 flex justify-between items-center">
        <div>
          <p className="text-xs text-gray-400">Cumplimiento equipo</p>
          <p className={`text-2xl font-bold ${pct >= 80 ? "text-green-400" : pct >= 60 ? "text-yellow-400" : "text-red-400"}`}>{pct}%</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">{agentes.length} agentes</p>
          {data.kpi?.alertas > 0 && <p className="text-xs text-red-400">⚠ {data.kpi.alertas} alertas</p>}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-left text-gray-500 font-normal pb-1 pr-2">Agente</th>
              {DIAS.map(d => <th key={d.num} className="text-center text-gray-500 font-normal pb-1 px-1 w-8">{d.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {agentes.map(({ bp, nombre }) => {
              const tieneAlerta = (data.kpi.bpsAlerta ?? []).includes(bp)
              return (
                <tr key={bp}>
                  <td className={`py-1 pr-2 break-words ${tieneAlerta ? "text-red-400 font-medium" : "text-gray-300"}`}>
                    {tieneAlerta && <span className="mr-1">⚠</span>}
                    {nombre}
                  </td>
                  {DIAS.map(d => {
                    const r = getRegistro(bp, d.num)
                    return (
                      <td key={d.num} className="text-center py-1 px-1">
                        <div className={`w-5 h-5 rounded mx-auto ${r ? colorPct(parseCumple(r.cumple) * 100) : "bg-gray-700"}`} />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block"/>Completo</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500 inline-block"/>Parcial</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block"/>No cumplió</span>
      </div>
    </div>
  )
}



