"use client"

import { useState, useMemo } from "react"
import ModuloCard from "@/components/ModuloCard"
import CoachTeamView from "@/components/CoachTeamView"
import { MODULOS_POR_ROL } from "@/lib/roles"
import type { PerfilUsuario, Persona, RolNormalizado } from "@/lib/jerarquia"
import { PerfilProvider } from "@/context/PerfilContext"
import { SemanaGlobalProvider } from "@/context/SemanaGlobalContext"
import SemanaGlobalSelector from "@/components/SemanaGlobalSelector"

const TODOS_MODULOS = [
  { id: "adherencia", titulo: "Adherencia 4DX", icono: "📋", descripcion: "Ingresos diarios del equipo" },
  { id: "practicas_lideres", titulo: "Prácticas Líderes", icono: "🎯", descripcion: "CDR y cumplimiento de prácticas" },
  { id: "practicas_coach", titulo: "Prácticas Coach", icono: "🏋️", descripcion: "Cumplimiento de prácticas del coach" },
  { id: "adherencia_pca", titulo: "Monitoreos de Calidad", icono: "🔍", descripcion: "PCA, PTA y Pauta de calidad" },
  { id: "resolutividad", titulo: "Circuito de Resolutividad", icono: "💡", descripcion: "Ideas y mejoras del equipo" },
  { id: "feedback", titulo: "Feedback Interfábricas", icono: "💬", descripcion: "Feedback entre compañeros" },
  { id: "compromisos", titulo: "Compromisos", icono: "🤝", descripcion: "Estado de compromisos por asesor" },
  { id: "confirmaciones_rol", titulo: "Confirmaciones de Rol", icono: "✅", descripcion: "Acompañamientos del coach" },
  { id: "quiz", titulo: "Quiz Semanal", icono: "📝", descripcion: "Presentación y aprobación" },
  { id: "estoy_enterado", titulo: "Estoy Enterado", icono: "📢", descripcion: "Seguimiento de briefings" },
  { id: "pausas_4dx", titulo: "Pausas 4DX", icono: "⏸️", descripcion: "Diálogo y CDR diario del equipo" },
]

const DEMOEQUIPOS: Record<RolNormalizado, Persona[]> = {
  supervisor: [
    {
      cedula: "1001",
      nombre: "JUAN PEREZ SUPERVISOR",
      cargo: "SUPERVISOR",
      servicio: "LUA AMC",
      jefeInmediato: "CARLOS LOPEZ",
      coordinador: "CARLOS LOPEZ",
      email: "juan@example.com",
      emailCorporativo: "juan.almacontact@outsourcing-account.com",
      usuarioLatam: "12345",
      estado: "Activo",
      area: "PASAJEROS",
    },
    {
      cedula: "1002",
      nombre: "MARIA GARCIA SUPERVISOR",
      cargo: "SUPERVISOR",
      servicio: "HVC AMC",
      jefeInmediato: "CARLOS LOPEZ",
      coordinador: "CARLOS LOPEZ",
      email: "maria@example.com",
      emailCorporativo: "maria.almacontact@outsourcing-account.com",
      usuarioLatam: "12346",
      estado: "Activo",
      area: "PASAJEROS",
    },
  ],
  coordinador: [
    {
      cedula: "2001",
      nombre: "CARLOS LOPEZ COORDINADOR",
      cargo: "COORDINADOR",
      servicio: "LUA AMC",
      jefeInmediato: "DIRECTOR GENERAL",
      coordinador: "DIRECTOR GENERAL",
      email: "carlos@example.com",
      emailCorporativo: "carlos.almacontact@outsourcing-account.com",
      usuarioLatam: "23456",
      estado: "Activo",
      area: "PASAJEROS",
    },
  ],
  coach: [
    {
      cedula: "3001",
      nombre: "PAULA COACH LATAM",
      cargo: "COACH",
      servicio: "COACHING",
      jefeInmediato: "SUPERVISOR",
      coordinador: "SUPERVISOR",
      email: "paula@latam.com",
      emailCorporativo: "paula.almacontact@outsourcing-account.com",
      usuarioLatam: "34567",
      estado: "Activo",
      area: "COACHING",
    },
  ],
  asesor: [],
  jefatura: [],
  gerente: [],
  desconocido: [],
  admin: [],
}

export default function DemoPage() {
  const [rolSeleccionado, setRolSeleccionado] = useState<RolNormalizado>("supervisor")

  // Crear perfil demo
  const demoPerfil: PerfilUsuario = useMemo(() => {
    const equipo = DEMOEQUIPOS[rolSeleccionado] || []
    const persona = equipo[0] || {
      cedula: "999",
      nombre: "USUARIO DEMO",
      cargo: "SUPERVISOR",
      servicio: "DEMO",
      jefeInmediato: "JEFE",
      coordinador: "JEFE",
      email: "demo@example.com",
      emailCorporativo: "demo@example.com",
      usuarioLatam: "999",
      estado: "Activo",
      area: "DEMO",
    }

    return {
      persona,
      rol: rolSeleccionado,
      equipo: equipo.slice(1), // El equipo es el resto
      supervisores: [],
    }
  }, [rolSeleccionado])

  const modulosVisibles = TODOS_MODULOS.filter(
    m => MODULOS_POR_ROL[rolSeleccionado]?.includes(m.id)
  )

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Dashboard 4DX - Demo</h1>
          <p className="text-xs text-gray-600">Vista de demostración por rol</p>
        </div>
        <select
          value={rolSeleccionado}
          onChange={e => setRolSeleccionado(e.target.value as RolNormalizado)}
          className="bg-white border border-gray-300 text-xs text-gray-900 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
        >
          <option value="supervisor">Supervisor</option>
          <option value="coordinador">Coordinador</option>
          <option value="coach">Coach</option>
        </select>
      </header>

      <main className="px-6 py-8 max-w-7xl mx-auto">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">
            Hola, {demoPerfil.persona.nombre.split(" ")[0]} 👋
          </h2>
          <div className="flex gap-2 mt-2">
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full capitalize">
              {rolSeleccionado}
            </span>
            <span className="text-xs text-gray-600">{demoPerfil.persona.servicio}</span>
            <span className="text-xs text-gray-600">
              {demoPerfil.equipo.length} personas en equipo
            </span>
          </div>
          <p className="text-gray-600 text-sm mt-2">
            {demoPerfil.equipo.length > 0
              ? `Tu equipo tiene ${demoPerfil.equipo.length} persona${demoPerfil.equipo.length !== 1 ? "s" : ""} — aquí tienes su resumen.`
              : "Aquí tienes el resumen de tu panel."}
          </p>
        </div>

        {modulosVisibles.length > 0 ? (
          <SemanaGlobalProvider>
            <div className="mb-4 flex justify-end">
              <SemanaGlobalSelector light />
            </div>
            <div className="flex flex-col gap-2 mb-8">
              {modulosVisibles.map(modulo => (
                <ModuloCard
                  key={modulo.id}
                  {...modulo}
                  equipo={demoPerfil.equipo}
                  rol={demoPerfil.rol}
                />
              ))}
            </div>

            {/* Vista de seguimiento de equipo para coaches */}
            {demoPerfil.rol === "coach" && (
              <PerfilProvider perfil={demoPerfil}>
                <CoachTeamView perfilCoach={demoPerfil} />
              </PerfilProvider>
            )}
          </SemanaGlobalProvider>
        ) : (
          <p className="text-gray-600 text-sm">No hay módulos configurados para este rol.</p>
        )}
      </main>

      <footer className="border-t border-gray-200 mt-12 px-6 py-4 text-center">
        <p className="text-xs text-gray-600">
          Esta es una página de demostración. Cambia el rol en la esquina superior derecha para ver cómo se vería para cada usuario.
        </p>
      </footer>
    </div>
  )
}
