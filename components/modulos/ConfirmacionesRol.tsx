"use client"

import { useEffect, useState } from "react"
import { usePerfilContext } from "@/context/PerfilContext"
import { useModuloUrl } from "@/hooks/useModuloUrl"
import { useModuloMetric } from "@/context/ModuloMetricContext"

interface Dims {
  preparacion: string; involucramiento: string; herramientas: string
  alineacion: string; reconocimiento: string; retroalimentacion: string
  seguimiento: string; tips: string; resumen: string
}

interface Confirmacion {
  fecha: string; ritual: string; pontos: string; oport: string; liderAcomp: string; dims: Dims
}

interface Data {
  total: number
  esSupervisor: boolean
  semanaActual: string
  deEstaSemana: number
  alertaSupervisor: string | null
  alertaCoach: string | null
  promedios: Record<string, number | null>
  dimMasAfectada: { key: string; label: string; valor: number } | null
  ultimas5: Confirmacion[]
}

const DIMS_LABELS: Record<string, string> = {
  preparacion: "Preparación", involucramiento: "Involucramiento",
  herramientas: "Herramientas", alineacion: "Alineación",
  reconocimiento: "Reconocimiento", retroalimentacion: "Retroalimentación",
  seguimiento: "Seguimiento", tips: "Tips", resumen: "Resumen",
}

function textoANumero(v: string): number | null {
  if (!v) return null
  const lower = v.toLowerCase()
  if (lower === "1" || lower.includes("completa")) return 100
  if (lower.includes("parcial")) return 50
  if (lower.includes("observado") || lower === "0") return 0
  const n = parseFloat(v)
  return isNaN(n) ? null : n <= 1 ? Math.round(n * 100) : Math.round(n)
}

function colorPct(n: number | null) {
  if (n === null) return "text-gray-500"
  if (n >= 80) return "text-green-400"
  if (n >= 60) return "text-yellow-400"
  return "text-red-400"
}

export default function ConfirmacionesRol() {
  const [data, setData] = useState<Data | null>(null)
  const [cargando, setCargando] = useState(true)
  const [expandida, setExpandida] = useState<number | null>(null)
  const url = useModuloUrl("/api/modulos/confirmaciones-rol")
  const { setMetric } = useModuloMetric()

  useEffect(() => {
    fetch(url).then(r => r.json()).then(d => {
      setData(d)
      if (d.esSupervisor) {
        setMetric({
          valor: `${d.total} recibidas`,
          alerta: d.dimMasAfectada && d.dimMasAfectada.valor < 80 ? 1 : 0,
          color: d.total > 0 ? "green" : "white",
        })
      } else {
        setMetric({
          valor: `${d.total} realizadas`,
          alerta: d.alertaCoach ? 1 : 0,
          color: d.deEstaSemana > 0 ? "green" : d.total > 0 ? "yellow" : "white",
        })
      }
    }).finally(() => setCargando(false))
  }, [url, setMetric])

  if (cargando) return <p className="text-xs text-gray-500 py-2">Cargando...</p>
  if (!data || data.total === 0 || !data.ultimas5) return <p className="text-xs text-gray-500 py-2">Sin confirmaciones registradas.</p>

  // ── VISTA SUPERVISOR — confirmaciones RECIBIDAS ──────────────────
  if (data.esSupervisor) {
    const promediosDims = Object.entries(DIMS_LABELS).map(([key, label]) => ({
      key, label, prom: data.promedios[key] ?? null
    }))
    const promGeneral = (() => {
      const vals = Object.values(data.promedios).filter((v): v is number => v !== null)
      return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b) / vals.length) : null
    })()

    return (
      <div className="space-y-4">
        {/* KPI */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-600">Confirmaciones recibidas</p>
            <p className="text-2xl font-bold text-gray-900">{data.total}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-600">Promedio general</p>
            <p className={`text-2xl font-bold ${colorPct(promGeneral)}`}>
              {promGeneral !== null ? `${promGeneral}%` : "—"}
            </p>
          </div>
        </div>

        {/* Alerta ítem más afectado */}
        {data.dimMasAfectada && data.dimMasAfectada.valor < 80 && (
          <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-3">
            <p className="text-xs text-yellow-400 font-medium">⚠ Ítem más afectado</p>
            <p className="text-sm text-gray-900 mt-1">{data.dimMasAfectada.label}</p>
            <p className="text-xs text-gray-500">{data.dimMasAfectada.valor}% promedio</p>
          </div>
        )}

        {/* Dimensiones */}
        <div className="space-y-2">
          {promediosDims.map(({ key, label, prom }) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs text-gray-600 w-32 truncate">{label}</span>
              <div className="flex-1 bg-white border border-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${prom === null ? "bg-gray-700" : prom >= 80 ? "bg-green-500" : prom >= 60 ? "bg-yellow-500" : "bg-red-500"}`}
                  style={{ width: `${prom ?? 0}%` }}
                />
              </div>
              <span className={`text-xs w-8 text-right ${colorPct(prom)}`}>
                {prom !== null ? `${prom}%` : "—"}
              </span>
            </div>
          ))}
        </div>

        {/* Últimas confirmaciones */}
        <div>
          <p className="text-xs text-gray-500 mb-2">Últimas confirmaciones</p>
          <div className="space-y-2">
            {data.ultimas5.map((c, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <button className="w-full px-3 py-2 text-left flex justify-between items-center"
                  onClick={() => setExpandida(expandida === i ? null : i)}>
                  <span className="text-xs text-gray-700">Confirmación #{data.total - data.ultimas5.length + i + 1}</span>
                  <span className="text-gray-600 text-xs">{expandida === i ? "▲" : "▼"}</span>
                </button>
                {expandida === i && (
                  <div className="px-3 pb-3 space-y-2 border-t border-gray-200">
                    {c.pontos && <div><p className="text-xs text-green-400 mt-2 mb-1">✓ Puntos fuertes</p><p className="text-xs text-gray-700">{c.pontos}</p></div>}
                    {c.oport && <div><p className="text-xs text-yellow-400 mb-1">↗ Oportunidades</p><p className="text-xs text-gray-700">{c.oport}</p></div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  function parseSheetDate(dateStr: string): Date | null {
    if (!dateStr) return null
    const parts = dateStr.split("/")
    if (parts.length === 3) {
      const day   = Number(parts[0])
      const month = Number(parts[1])
      const year  = Number(parts[2].split(" ")[0].split("T")[0])
      if (!isNaN(day) && !isNaN(month) && !isNaN(year) && year > 1900) {
        const d = new Date(year, month - 1, day)
        return isNaN(d.getTime()) ? null : d
      }
    }
    const d = new Date(dateStr)
    return isNaN(d.getTime()) ? null : d
  }

  // ── VISTA COACH/COORDINADOR — confirmaciones REALIZADAS ───────────
  // Misma lógica que el backend: lunes 00:00 → domingo 23:59
  const hoy = new Date()
  const diaSemana = hoy.getDay()
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() - (diaSemana === 0 ? 6 : diaSemana - 1))
  lunes.setHours(0, 0, 0, 0)
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)
  domingo.setHours(23, 59, 59, 999)

  const confirmacionesEstaSemana = data.ultimas5.filter(c => {
    if (!c.fecha) return false
    const d = parseSheetDate(c.fecha)
    return d !== null && d >= lunes && d <= domingo
  })

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-600">Esta semana</p>
          <p className={`text-2xl font-bold ${data.deEstaSemana > 0 ? "text-green-600" : "text-red-600"}`}>
            {data.deEstaSemana}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-600">Total realizadas</p>
          <p className="text-2xl font-bold text-gray-900">{data.total}</p>
        </div>
      </div>

      {/* Alerta si no ha hecho esta semana */}
      {data.alertaCoach && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-xs text-red-700 font-medium">⚠ {data.alertaCoach}</p>
        </div>
      )}

      {/* Confirmaciones de esta semana */}
      <div>
        <p className="text-xs text-gray-600 mb-2">Confirmaciones de esta semana</p>
        {confirmacionesEstaSemana.length > 0 ? (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {confirmacionesEstaSemana.map((c, i) => (
              <div key={i} className="flex items-center justify-between bg-white border border-gray-200 rounded px-3 py-2">
                <span className="text-xs text-gray-700 truncate max-w-[160px]">{c.liderAcomp.split(" ").slice(0, 3).join(" ")}</span>
                {c.ritual && <span className="text-xs text-gray-500 truncate max-w-[80px]">{c.ritual}</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500">Sin confirmaciones esta semana</p>
        )}
      </div>
    </div>
  )
}



