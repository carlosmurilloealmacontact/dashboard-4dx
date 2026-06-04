"use client"

import { useEffect, useState } from "react"
import ModuloCard from "@/components/ModuloCard"
import { PerfilProvider } from "@/context/PerfilContext"
import { MODULOS_POR_ROL } from "@/lib/roles"
import type { PerfilUsuario, Persona } from "@/lib/jerarquia"

interface Props {
  perfilAdmin: PerfilUsuario
}

const MODULOS_EQUIPO = [
  { id: "adherencia", titulo: "Adherencia 4DX", icono: "📋", descripcion: "Ingresos diarios del equipo" },
  { id: "practicas_lideres", titulo: "Prácticas Líderes", icono: "🎯", descripcion: "CDR y cumplimiento de prácticas" },
  { id: "compromisos", titulo: "Compromisos", icono: "🤝", descripcion: "Estado de compromisos por asesor" },
  { id: "quiz", titulo: "Quiz Semanal", icono: "📝", descripcion: "Presentación y aprobación" },
  { id: "estoy_enterado", titulo: "Estoy Enterado", icono: "📢", descripcion: "Seguimiento de briefings" },
  { id: "feedback", titulo: "Feedback Interfábricas", icono: "💬", descripcion: "Feedback entre compañeros" },
  { id: "resolutividad", titulo: "Circuito de Resolutividad", icono: "💡", descripcion: "Ideas y mejoras del equipo" },
]

const ROLES_DISPONIBLES = ["supervisor", "coordinador", "coach", "jefatura", "gerente", "asesor"]

export default function AdminView({ perfilAdmin }: Props) {
  const [equipoCompleto, setEquipoCompleto] = useState<Persona[]>([])
  const [filtroRol, setFiltroRol] = useState("")
  const [filtroCoordinador, setFiltroCoordinador] = useState("")
  const [filtroServicio, setFiltroServicio] = useState("")
  const [personaSeleccionadaEmail, setPersonaSeleccionadaEmail] = useState("")
  const [cargandoFiltros, setCargandoFiltros] = useState(true)
  const [errorFiltros, setErrorFiltros] = useState("")

  useEffect(() => {
    fetch("/api/jerarquia")
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(d => {
        if (d.error) throw new Error(d.error)
        // El equipo del admin es todos los usuarios activos
        setEquipoCompleto(d.equipo ?? [])
      })
      .catch(e => {
        console.error("ERROR cargando equipo:", e)
        setErrorFiltros(e.message)
      })
      .finally(() => setCargandoFiltros(false))
  }, [])

  // Obtener valores únicos para los filtros
  const coordinadoresUnicos = [...new Set(equipoCompleto.map(p => p.coordinador).filter(Boolean))].sort()
  const serviciosUnicos = [...new Set(equipoCompleto.map(p => p.servicio).filter(Boolean))].sort()

  // Aplicar filtros
  const equipoFiltrado = equipoCompleto.filter(p => {
    const cargo = (p.cargo ?? "").toLowerCase()

    if (filtroRol) {
      const coincideRol = cargo.includes(filtroRol.toLowerCase())
      if (!coincideRol) return false
    }

    if (filtroCoordinador && p.coordinador !== filtroCoordinador) return false
    if (filtroServicio && p.servicio !== filtroServicio) return false

    return true
  })

  // Persona seleccionada explícitamente por el admin
  const personaSeleccionada = equipoFiltrado.find(p => {
    const email = p.emailCorporativo || p.email
    return email === personaSeleccionadaEmail
  })
  const teamEmail = personaSeleccionada?.emailCorporativo || personaSeleccionada?.email || ""

  return (
    <div className="mt-10">
      {/* Separador */}
      <div className="border-t border-gray-800 mb-8" />

      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white mb-1">Seguimiento Administrativo</h3>
        {errorFiltros && (
          <p className="text-red-400 text-xs mb-2">Error al cargar equipo: {errorFiltros}</p>
        )}
        {cargandoFiltros && !errorFiltros && (
          <p className="text-gray-500 text-xs mb-2">Cargando equipo...</p>
        )}
        {!cargandoFiltros && !errorFiltros && (
          <p className="text-gray-500 text-sm">Filtra por rol, coordinador o servicio para hacer seguimiento.</p>
        )}
      </div>

      {/* Filtros - Fila 1 */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        {/* Filtro de rol */}
        <select
          className="bg-gray-800 border border-gray-700 text-xs text-white rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 min-w-[150px]"
          value={filtroRol}
          onChange={e => { setFiltroRol(e.target.value); setPersonaSeleccionadaEmail("") }}
          disabled={cargandoFiltros}
        >
          <option value="">— Todos los roles —</option>
          {ROLES_DISPONIBLES.map(rol => (
            <option key={rol} value={rol} className="capitalize">
              {rol.charAt(0).toUpperCase() + rol.slice(1)}
            </option>
          ))}
        </select>

        {/* Filtro de coordinador */}
        <select
          className="bg-gray-800 border border-gray-700 text-xs text-white rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 min-w-[220px]"
          value={filtroCoordinador}
          onChange={e => { setFiltroCoordinador(e.target.value); setPersonaSeleccionadaEmail("") }}
          disabled={cargandoFiltros}
        >
          <option value="">— Todos los coordinadores —</option>
          {coordinadoresUnicos.map(coord => (
            <option key={coord} value={coord}>
              {coord.split(" ").slice(0, 3).join(" ")}
            </option>
          ))}
        </select>

        {/* Filtro de servicio */}
        <select
          className="bg-gray-800 border border-gray-700 text-xs text-white rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 min-w-[200px]"
          value={filtroServicio}
          onChange={e => { setFiltroServicio(e.target.value); setPersonaSeleccionadaEmail("") }}
          disabled={cargandoFiltros}
        >
          <option value="">— Todos los servicios —</option>
          {serviciosUnicos.map(srv => (
            <option key={srv} value={srv}>{srv}</option>
          ))}
        </select>

        {(filtroRol || filtroCoordinador || filtroServicio || personaSeleccionadaEmail) && (
          <button
            className="text-xs text-gray-500 hover:text-white px-3 py-2 border border-gray-700 rounded-lg"
            onClick={() => {
              setFiltroRol("")
              setFiltroCoordinador("")
              setFiltroServicio("")
              setPersonaSeleccionadaEmail("")
            }}
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Selector de persona - Fila 2 (si hay resultados) */}
      {equipoFiltrado.length > 0 && (
        <div className="flex gap-3 mb-6 flex-wrap items-center">
          <select
            className="bg-gray-800 border border-gray-700 text-xs text-white rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 min-w-[300px]"
            value={personaSeleccionadaEmail}
            onChange={e => setPersonaSeleccionadaEmail(e.target.value)}
            disabled={cargandoFiltros}
          >
            <option value="">— Selecciona una persona —</option>
            {equipoFiltrado.map(persona => {
              const email = persona.emailCorporativo || persona.email
              return (
                <option key={email} value={email}>
                  {persona.nombre.split(" ").slice(0, 3).join(" ")} · {persona.cargo} · {persona.servicio}
                </option>
              )
            })}
          </select>
        </div>
      )}

      {/* Módulos del equipo filtrado - Solo si se selecciona una persona */}
      {personaSeleccionada && teamEmail ? (
        <PerfilProvider perfil={perfilAdmin} teamEmail={teamEmail}>
          <div>
            <p className="text-xs text-gray-500 mb-4">
              Seguimiento de <span className="text-white">{personaSeleccionada.nombre.split(" ").slice(0, 3).join(" ")}</span>
              {personaSeleccionada.cargo && <span className="text-gray-600"> · {personaSeleccionada.cargo}</span>}
              {personaSeleccionada.servicio && <span className="text-gray-600"> · {personaSeleccionada.servicio}</span>}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {MODULOS_EQUIPO.map(m => (
                <ModuloCard
                  key={m.id}
                  {...m}
                  equipo={[]}
                  rol="admin"
                />
              ))}
            </div>
          </div>
        </PerfilProvider>
      ) : !cargandoFiltros && equipoFiltrado.length > 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-500 text-sm">
            {equipoFiltrado.length} persona(s) encontrada(s). Selecciona una de arriba para ver el seguimiento.
          </p>
        </div>
      ) : !cargandoFiltros ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-500 text-sm">Usa los filtros para encontrar y seleccionar una persona.</p>
        </div>
      ) : null}
    </div>
  )
}
