"use client"

import { useState } from "react"
import ModuloCard from "@/components/ModuloCard"
import { PerfilProvider } from "@/context/PerfilContext"
import type { PerfilUsuario, Persona } from "@/lib/jerarquia"

// Función para normalizar cargo (mismo que en jerarquia.ts)
function normalizarCargo(cargo: string): string {
  const c = cargo.toLowerCase()
  if (c.includes("gerente") || c.includes("director")) return "gerente"
  if (c.includes("jefatura") || c.includes("jefe")) return "jefatura"
  if (c.includes("coordinador")) return "coordinador"
  if (c.includes("coach")) return "coach"
  if (c.includes("supervisor") || c.includes("lider") || c.includes("líder")) return "supervisor"
  if (c.includes("asesor") || c.includes("agente") || c.includes("aprendiz")) return "asesor"
  return "desconocido"
}

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

const ROLES_DISPONIBLES = ["supervisor", "coordinador", "coach"]

const COORDINADORES_PERMITIDOS = [
  "ROJAS LEGUIZAMO ANDRES FELIPE",
  "HERNANDEZ URREGO CRISTIAN ENRIQUE",
  "MARTINEZ PEREZ JHON ALEXANDER",
  "MONSALVE HERRERA JOHN JAMES",
  "LOBO VERA LADY VANESSA",
  "CARBONO PEDROZA YINEIDIS YESENIA"
]

export default function AdminView({ perfilAdmin }: Props) {
  const [filtroRol, setFiltroRol] = useState("")
  const [filtroCoordinador, setFiltroCoordinador] = useState("")
  const [filtroServicio, setFiltroServicio] = useState("")
  const [personaSeleccionadaEmail, setPersonaSeleccionadaEmail] = useState("")

  // El equipo completo viene del perfil del admin
  const equipoCompleto = perfilAdmin.equipo ?? []
  const cargandoFiltros = false
  const errorFiltros = ""

  // Primero, filtrar personas que estén bajo los 6 coordinadores permitidos
  const equipoPermitido = equipoCompleto.filter(p =>
    COORDINADORES_PERMITIDOS.includes(p.coordinador)
  )

  // Obtener valores únicos para los filtros (dinámicos según rol seleccionado)
  let coordinadoresUnicos = COORDINADORES_PERMITIDOS.filter(coord =>
    equipoPermitido.some(p => p.coordinador === coord)
  )

  let serviciosUnicos: string[] = []

  // Si hay un rol seleccionado, filtrar coordinadores y servicios por ese rol
  if (filtroRol) {
    coordinadoresUnicos = coordinadoresUnicos.filter(coord =>
      equipoPermitido.some(p => {
        const rolNormalizado = normalizarCargo(p.cargo)
        return rolNormalizado === filtroRol && p.coordinador === coord
      })
    )

    serviciosUnicos = [...new Set(
      equipoPermitido
        .filter(p => {
          const rolNormalizado = normalizarCargo(p.cargo)
          return rolNormalizado === filtroRol
        })
        .map(p => p.servicio)
        .filter(Boolean)
    )].sort()
  } else {
    // Sin rol seleccionado, mostrar servicios de supervisores bajo los 6 coordinadores
    serviciosUnicos = [...new Set(
      equipoPermitido
        .filter(p => normalizarCargo(p.cargo) === "supervisor")
        .map(p => p.servicio)
        .filter(Boolean)
    )].sort()
  }

  // Si hay coordinador seleccionado, filtrar servicios por ese coordinador
  if (filtroCoordinador && !filtroRol) {
    serviciosUnicos = serviciosUnicos.filter(srv =>
      equipoPermitido.some(p => p.coordinador === filtroCoordinador && p.servicio === srv)
    )
  }

  // Aplicar filtros
  const equipoFiltrado = equipoPermitido.filter(p => {
    // Solo mostrar los 3 roles permitidos
    const rolNormalizado = normalizarCargo(p.cargo)
    if (!ROLES_DISPONIBLES.includes(rolNormalizado)) return false

    if (filtroRol && rolNormalizado !== filtroRol) return false
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
      <div className="border-t border-gray-200 mb-8" />

      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Seguimiento Administrativo</h3>
        {errorFiltros && (
          <p className="text-red-600 text-xs mb-2">Error al cargar equipo: {errorFiltros}</p>
        )}
        {cargandoFiltros && !errorFiltros && (
          <p className="text-gray-600 text-xs mb-2">Cargando equipo...</p>
        )}
        {!cargandoFiltros && !errorFiltros && (
          <p className="text-gray-600 text-sm">Filtra por rol, coordinador o servicio para hacer seguimiento.</p>
        )}
      </div>

      {/* Filtros - Fila 1 */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        {/* Filtro de rol */}
        <select
          className="bg-white border border-gray-300 text-xs text-gray-900 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
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
          className="bg-white border border-gray-300 text-xs text-gray-900 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
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
          className="bg-white border border-gray-300 text-xs text-gray-900 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
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
            className="text-xs text-gray-600 hover:text-gray-900 px-3 py-2 border border-gray-300 rounded-lg"
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
            className="bg-white border border-gray-300 text-xs text-gray-900 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            value={personaSeleccionadaEmail}
            onChange={e => setPersonaSeleccionadaEmail(e.target.value)}
            disabled={cargandoFiltros}
          >
            <option value="">— Selecciona una persona —</option>
            {equipoFiltrado.map(persona => {
              const email = persona.emailCorporativo || persona.email
              return (
                <option key={persona.cedula} value={email}>
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
            <p className="text-xs text-gray-600 mb-4">
              Seguimiento de <span className="text-gray-900 font-semibold">{personaSeleccionada.nombre.split(" ").slice(0, 3).join(" ")}</span>
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
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-600 text-sm">
            {equipoFiltrado.length} persona(s) encontrada(s). Selecciona una de arriba para ver el seguimiento.
          </p>
        </div>
      ) : !cargandoFiltros ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-600 text-sm">Usa los filtros para encontrar y seleccionar una persona.</p>
        </div>
      ) : null}
    </div>
  )
}
