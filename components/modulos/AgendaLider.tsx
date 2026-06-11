"use client"

import { useEffect, useState } from "react"
import { useModuloUrl } from "@/hooks/useModuloUrl"
import { useModuloMetric } from "@/context/ModuloMetricContext"

interface AgendaInfo {
  archivo: string | null
  ultimaModificacion: string | null
  diasDesdeModificacion: number | null
  alerta: boolean | null
}

interface MiembroEquipo extends AgendaInfo {
  supervisor: string
}

interface Data {
  esCoord: boolean
  propio?: AgendaInfo | null
  equipo?: MiembroEquipo[]
}

function formatearFecha(fecha: string | null): string {
  if (!fecha) return "—"
  const [y, m, d] = fecha.split("-")
  return `${d}/${m}/${y}`
}

export default function AgendaLider() {
  const [data, setData] = useState<Data | null>(null)
  const [cargando, setCargando] = useState(true)
  const url = useModuloUrl("/api/modulos/agenda-lider")
  const { setMetric } = useModuloMetric()

  useEffect(() => {
    fetch(url).then(r => r.json()).then(d => {
      setData(d)
      if (d.esCoord) {
        const equipo: MiembroEquipo[] = d.equipo ?? []
        const conAlerta = equipo.filter(e => e.alerta === true).length
        const sinDatos = equipo.filter(e => e.ultimaModificacion === null).length
        setMetric({
          valor: equipo.length > 0 ? `${equipo.length - conAlerta - sinDatos}/${equipo.length} al día` : "—",
          alerta: conAlerta + sinDatos,
          color: conAlerta + sinDatos === 0 && equipo.length > 0 ? "green" : "yellow",
        })
      } else {
        const propio: AgendaInfo | null = d.propio ?? null
        if (!propio) {
          setMetric({ valor: "—", color: "white" })
        } else {
          setMetric({
            valor: `${propio.diasDesdeModificacion}d`,
            alerta: propio.alerta ? 1 : 0,
            color: propio.alerta ? "red" : "green",
          })
        }
      }
    }).finally(() => setCargando(false))
  }, [url, setMetric])

  if (cargando) return <p className="text-xs text-gray-500 py-2">Cargando...</p>
  if (!data) return <p className="text-xs text-gray-500 py-2">Sin información disponible.</p>

  // ── VISTA SUPERVISOR — su propia agenda ──────────────────────────
  if (!data.esCoord) {
    const propio = data.propio ?? null

    if (!propio) {
      return (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-xs text-yellow-700 font-medium">No se encontró tu archivo de agenda</p>
          <p className="text-xs text-gray-500 mt-1">Valida si hay alguna novedad con la ubicación o el nombre del archivo en Drive.</p>
        </div>
      )
    }

    return (
      <div className="space-y-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-600">Última actualización de tu agenda</p>
          <p className="text-2xl font-bold text-gray-900">{formatearFecha(propio.ultimaModificacion)}</p>
          <p className="text-xs text-gray-500 mt-1">
            Hace {propio.diasDesdeModificacion} día{propio.diasDesdeModificacion === 1 ? "" : "s"}
          </p>
        </div>

        {propio.alerta && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-xs text-red-700 font-medium">⚠ Tu agenda lleva más de 7 días sin actualizarse</p>
            <p className="text-xs text-gray-500 mt-1">Por favor actualízala con tus rituales y seguimiento al equipo.</p>
          </div>
        )}
      </div>
    )
  }

  // ── VISTA COORDINADOR — agenda de cada líder ─────────────────────
  const equipo = data.equipo ?? []

  if (equipo.length === 0) {
    return <p className="text-xs text-gray-500 py-2">Sin líderes en tu equipo.</p>
  }

  return (
    <div className="space-y-2">
      {equipo.map((m, i) => (
        <div key={i} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
          <span className="text-xs text-gray-700 truncate max-w-[140px]">{m.supervisor}</span>
          {m.ultimaModificacion === null ? (
            <span className="text-xs text-yellow-600">Sin archivo</span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{formatearFecha(m.ultimaModificacion)}</span>
              <span className="text-xs text-gray-400">({m.diasDesdeModificacion}d)</span>
              {m.alerta && (
                <span className="text-xs bg-red-50 text-red-500 border border-red-200 px-1.5 py-0.5 rounded-full font-semibold leading-none">
                  ⚠
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
