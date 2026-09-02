"use client"

import { useState } from "react"
import ModuloCard from "@/components/ModuloCard"
import CoachTeamView from "@/components/CoachTeamView"
import InformeIA from "@/components/InformeIA"
import { PerfilProvider } from "@/context/PerfilContext"
import { SemanaGlobalProvider } from "@/context/SemanaGlobalContext"
import SemanaGlobalSelector from "@/components/SemanaGlobalSelector"
import { MODULOS_POR_ROL } from "@/lib/roles"
import { modulosPorIds } from "@/lib/modulos"
import type { PerfilUsuario, Persona, RolNormalizado } from "@/lib/jerarquia"
import { ROLES_DISPONIBLES, filtrarPorRol, normalizarCargo } from "@/lib/equipoAdmin"
import PanelControlAdmin from "@/components/PanelControlAdmin"

interface Props {
  perfilAdmin: PerfilUsuario
}

export default function AdminView({ perfilAdmin }: Props) {
  const [filtroRol, setFiltroRol] = useState("")
  const [filtroServicio, setFiltroServicio] = useState("")
  const [personaSeleccionadaEmail, setPersonaSeleccionadaEmail] = useState("")

  // El equipo completo viene del perfil del admin
  const equipoCompleto = perfilAdmin.equipo ?? []
  const cargandoFiltros = false
  const errorFiltros = ""

  // ── Filtros cruzados (bidireccionales) ───────────────────────────────
  // - Si hay un rol elegido → los servicios disponibles son los de ese rol.
  // - Si no → la unión de servicios de todos los roles disponibles.
  const serviciosDisponibles = filtroRol
    ? [...new Set(filtrarPorRol(equipoCompleto, filtroRol).map(p => p.servicio).filter(Boolean))].sort()
    : [...new Set(ROLES_DISPONIBLES.flatMap(r => filtrarPorRol(equipoCompleto, r)).map(p => p.servicio).filter(Boolean))].sort()

  // - Si hay un servicio elegido → solo se ofrecen los roles que tienen gente en ese servicio.
  // - Si no → todos los roles disponibles.
  const rolesDisponibles = filtroServicio
    ? ROLES_DISPONIBLES.filter(r => filtrarPorRol(equipoCompleto, r).some(p => p.servicio === filtroServicio))
    : ROLES_DISPONIBLES

  // Equipo final: aplicar rol y servicio elegidos
  const equipoFiltrado = filtrarPorRol(equipoCompleto, filtroRol)
    .filter(p => !filtroServicio || p.servicio === filtroServicio)
    .sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? "", "es", { sensitivity: "base" }))

  // Persona seleccionada explícitamente por el admin
  const personaSeleccionada = equipoFiltrado.find(p => {
    const email = p.emailCorporativo || p.email
    return email === personaSeleccionadaEmail
  })
  const teamEmail = personaSeleccionada?.emailCorporativo || personaSeleccionada?.email || ""

  // Módulos visibles para el rol de la persona seleccionada (misma vista que vería ella)
  const rolPersona = filtroRol as RolNormalizado
  const modulosPersona = modulosPorIds(MODULOS_POR_ROL[rolPersona] ?? [])

  // Supervisores a cargo de la persona seleccionada (para el informe IA, si es coordinador/jefatura/gerente)
  const supervisoresDePersona = personaSeleccionada
    ? equipoCompleto.filter(p =>
        (p.coordinador ?? "").toLowerCase().trim() === personaSeleccionada.nombre.toLowerCase().trim()
        && normalizarCargo(p.cargo) === "supervisor"
      ).sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? "", "es", { sensitivity: "base" }))
    : []

  return (
    <SemanaGlobalProvider>
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
          <p className="text-gray-600 text-sm">Selecciona un rol, servicio y persona para hacer seguimiento.</p>
        )}
      </div>

      <PanelControlAdmin />

      {/* Filtros - Rol y Servicio (bidireccionales) */}
      <div className="flex gap-3 mb-6 flex-wrap items-center">
        {/* Filtro de rol */}
        <select
          className="bg-white border border-gray-300 text-xs text-gray-900 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
          value={filtroRol}
          onChange={e => {
            const nuevo = e.target.value
            setFiltroRol(nuevo)
            // Si el servicio elegido no aplica para el nuevo rol, lo limpiamos
            if (filtroServicio && nuevo) {
              const serviciosDelRol = new Set(filtrarPorRol(equipoCompleto, nuevo).map(p => p.servicio))
              if (!serviciosDelRol.has(filtroServicio)) setFiltroServicio("")
            }
            setPersonaSeleccionadaEmail("")
          }}
          disabled={cargandoFiltros}
        >
          <option value="">— Selecciona un rol —</option>
          {rolesDisponibles.map(rol => (
            <option key={rol} value={rol} className="capitalize">
              {rol.charAt(0).toUpperCase() + rol.slice(1)}
            </option>
          ))}
        </select>

        {/* Filtro de servicio */}
        {serviciosDisponibles.length > 0 && (
          <select
            className="bg-white border border-gray-300 text-xs text-gray-900 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            value={filtroServicio}
            onChange={e => {
              const nuevo = e.target.value
              setFiltroServicio(nuevo)
              // Si el rol elegido no tiene gente en el nuevo servicio, lo limpiamos
              if (filtroRol && nuevo) {
                const tieneGente = filtrarPorRol(equipoCompleto, filtroRol).some(p => p.servicio === nuevo)
                if (!tieneGente) setFiltroRol("")
              }
              setPersonaSeleccionadaEmail("")
            }}
            disabled={cargandoFiltros}
          >
            <option value="">— Todos los servicios —</option>
            {serviciosDisponibles.map(srv => (
              <option key={srv} value={srv}>{srv}</option>
            ))}
          </select>
        )}

        {(filtroRol || filtroServicio || personaSeleccionadaEmail) && (
          <button
            className="text-xs text-gray-600 hover:text-gray-900 px-3 py-2 border border-gray-300 rounded-lg"
            onClick={() => {
              setFiltroRol("")
              setFiltroServicio("")
              setPersonaSeleccionadaEmail("")
            }}
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Selector de persona (si hay resultados) */}
      {filtroRol && equipoFiltrado.length > 0 && (
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
                  {persona.nombre} · {persona.cargo} · {persona.servicio}
                </option>
              )
            })}
          </select>
          <SemanaGlobalSelector light />
        </div>
      )}

      {/* Módulos del equipo filtrado - Solo si se selecciona una persona */}
      {personaSeleccionada && teamEmail ? (
        <PerfilProvider perfil={perfilAdmin} teamEmail={teamEmail}>
          <div>
            <p className="text-xs text-gray-600 mb-4">
              Viendo como <span className="text-gray-900 font-semibold">{personaSeleccionada.nombre}</span>
              {personaSeleccionada.cargo && <span className="text-gray-600"> · {personaSeleccionada.cargo}</span>}
              {personaSeleccionada.servicio && <span className="text-gray-600"> · {personaSeleccionada.servicio}</span>}
            </p>
            {!personaSeleccionada.emailCorporativo && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">
                ⚠️ Esta persona no tiene &quot;usuario gestor 4&quot; (correo corporativo) en la base — se está usando su correo personal ({personaSeleccionada.email}). Complétalo en la base para evitar inconsistencias.
              </p>
            )}
            {modulosPersona.length > 0 ? (
              <div className="flex flex-col gap-2">
                {modulosPersona.map(m => (
                  <ModuloCard
                    key={m.id}
                    {...m}
                    equipo={[]}
                    rol={rolPersona}
                  />
                ))}
              </div>
            ) : (
              <p className="text-gray-600 text-sm">No hay módulos configurados para este rol.</p>
            )}

            {/* Si la persona es coach, mostrar también su vista de seguimiento de equipo */}
            {rolPersona === "coach" && (
              <CoachTeamView perfilCoach={perfilAdmin} />
            )}

            {/* Informe de cumplimiento generado con IA, para coordinadores y jefaturas */}
            {["coordinador", "jefatura", "gerente"].includes(rolPersona) && (
              <InformeIA supervisores={supervisoresDePersona} email={teamEmail} permitirEnvioCorreo />
            )}
          </div>
        </PerfilProvider>
      ) : filtroRol && equipoFiltrado.length > 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-600 text-sm">
            {equipoFiltrado.length} persona(s) encontrada(s). Selecciona una arriba.
          </p>
        </div>
      ) : filtroRol && equipoFiltrado.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-600 text-sm">No hay personas con este filtro.</p>
        </div>
      ) : !cargandoFiltros ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-600 text-sm">Selecciona un rol para empezar.</p>
        </div>
      ) : null}
    </div>
    </SemanaGlobalProvider>
  )
}
