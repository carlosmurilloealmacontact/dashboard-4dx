"use client"

import { useEffect, useState } from "react"
import ModuloCard from "@/components/ModuloCard"
import { PerfilProvider } from "@/context/PerfilContext"
import { SemanaGlobalProvider } from "@/context/SemanaGlobalContext"
import SemanaGlobalSelector from "@/components/SemanaGlobalSelector"
import { MODULOS_EQUIPO } from "@/lib/modulos"
import type { PerfilUsuario } from "@/lib/jerarquia"

interface Coordinador {
  nombre: string
  email: string
  servicio: string
  area: string
  servicios?: string[]  // servicios de sus supervisores
}

interface Props {
  perfilCoach: PerfilUsuario
}

export default function CoachTeamView({ perfilCoach }: Props) {
  const [coordinadores, setCoordinadores] = useState<Coordinador[]>([])
  const [filtroServicio, setFiltroServicio] = useState("")
  const [filtroCoord, setFiltroCoord] = useState("")
  const [cargandoFiltros, setCargandoFiltros] = useState(true)
  const [errorFiltros, setErrorFiltros] = useState("")

  useEffect(() => {
    fetch("/api/jerarquia/coordinadores")
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(d => {
        if (d.error) throw new Error(d.error)
        setCoordinadores(d.coordinadores ?? [])
      })
      .catch(e => {
        console.error("ERROR cargando coordinadores:", e)
        setErrorFiltros(e.message)
      })
      .finally(() => setCargandoFiltros(false))
  }, [])

  // Coordinador seleccionado
  const coordSeleccionado = coordinadores.find(c => c.email === filtroCoord)

  // Filtros cruzados (bidireccionales):
  // - Si hay un coordinador elegido → los servicios disponibles son los suyos.
  // - Si no → todos los servicios de todos los coordinadores.
  const serviciosDisponibles = coordSeleccionado
    ? [...new Set(coordSeleccionado.servicios ?? [])].sort()
    : [...new Set(coordinadores.flatMap(c => c.servicios ?? []))].sort()

  // - Si hay un servicio elegido → los coordinadores disponibles son los que lo tienen.
  // - Si no → todos los coordinadores.
  const coordnadoresPorServicio = filtroServicio
    ? coordinadores.filter(c => (c.servicios ?? []).includes(filtroServicio))
    : coordinadores

  // Email del coordinador seleccionado y servicio para pasar a los módulos
  const teamEmail = coordSeleccionado?.email ?? ""
  const servicioFiltrado = filtroServicio

  return (
    <div className="mt-4">
      {/* Separador */}
      <div className="border-t border-gray-200 mb-4" />

      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Seguimiento de Equipo</h3>
        {errorFiltros && (
          <p className="text-red-400 text-xs mb-2">Error al cargar coordinadores: {errorFiltros}</p>
        )}
        {cargandoFiltros && !errorFiltros && (
          <p className="text-gray-500 text-xs mb-2">Cargando coordinadores...</p>
        )}
        {!cargandoFiltros && !errorFiltros && (
          <p className="text-gray-500 text-sm">Selecciona un coordinador o servicio para ver el estado de su equipo.</p>
        )}
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-6 flex-wrap items-center">
        {/* Filtro de servicio */}
        {serviciosDisponibles.length > 0 && (
          <select
            className="bg-gray-800 border border-gray-700 text-xs text-white rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 min-w-[200px]"
            value={filtroServicio}
            onChange={e => {
              const nuevo = e.target.value
              setFiltroServicio(nuevo)
              // Si el coordinador elegido no atiende ese servicio, lo limpiamos
              if (nuevo && coordSeleccionado && !(coordSeleccionado.servicios ?? []).includes(nuevo)) {
                setFiltroCoord("")
              }
            }}
            disabled={cargandoFiltros}
          >
            <option value="">— Todos los servicios —</option>
            {serviciosDisponibles.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}

        {/* Filtro de coordinador */}
        <select
          className="bg-gray-800 border border-gray-700 text-xs text-white rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 min-w-[220px]"
          value={filtroCoord}
          onChange={e => setFiltroCoord(e.target.value)}
          disabled={cargandoFiltros}
        >
          <option value="">— Selecciona un coordinador —</option>
          {coordnadoresPorServicio.map(c => (
            <option key={c.email} value={c.email}>
              {c.nombre}
            </option>
          ))}
        </select>

        {(filtroCoord || filtroServicio) && (
          <button
            className="text-xs text-gray-500 hover:text-white px-3 py-2 border border-gray-700 rounded-lg"
            onClick={() => { setFiltroCoord(""); setFiltroServicio("") }}
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Módulos del equipo */}
      {teamEmail ? (
        <SemanaGlobalProvider>
          <div className="mb-4 flex items-center gap-3 flex-wrap">
            <SemanaGlobalSelector />
          </div>
          <PerfilProvider perfil={perfilCoach} teamEmail={teamEmail} servicio={servicioFiltrado}>
            <div>
              {coordSeleccionado && (
                <p className="text-xs text-gray-500 mb-4">
                  Mostrando equipo de <span className="text-white">{coordSeleccionado.nombre}</span>
                  {coordSeleccionado.servicio && <span className="text-gray-600"> · {coordSeleccionado.servicio}</span>}
                </p>
              )}
              <div className="flex flex-col gap-2">
                {MODULOS_EQUIPO.map(m => (
                  <ModuloCard
                    key={m.id}
                    {...m}
                    equipo={[]}
                    rol="coordinador"
                    servicio={servicioFiltrado}
                  />
                ))}
              </div>
            </div>
          </PerfilProvider>
        </SemanaGlobalProvider>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-500 text-sm">Selecciona un coordinador para ver el estado de su equipo.</p>
        </div>
      )}
    </div>
  )
}
