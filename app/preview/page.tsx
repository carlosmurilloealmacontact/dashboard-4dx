"use client"

// Página solo para desarrollo — simula la vista de cualquier usuario por email
import { useState } from "react"
import ModuloCard from "@/components/ModuloCard"
import CoachTeamView from "@/components/CoachTeamView"
import AdminView from "@/components/AdminView"
import { MODULOS_POR_ROL } from "@/lib/roles"
import type { PerfilUsuario } from "@/lib/jerarquia"
import { PerfilProvider } from "@/context/PerfilContext"
import { SemanaGlobalProvider } from "@/context/SemanaGlobalContext"
import SemanaGlobalSelector from "@/components/SemanaGlobalSelector"

const TODOS_MODULOS = [
  { id: "adherencia", titulo: "Adherencia 4DX", icono: "📋", descripcion: "Ingresos diarios del equipo" },
  { id: "practicas_lideres", titulo: "Prácticas Líderes", icono: "🎯", descripcion: "CDR y cumplimiento de prácticas" },
  { id: "practicas_coach", titulo: "Prácticas Coach", icono: "🏋️", descripcion: "Cumplimiento de prácticas del coach" },
  { id: "adherencia_pca", titulo: "Adherencia PCA/PTA", icono: "🔍", descripcion: "Logueo y revisiones diarias" },
  { id: "resolutividad", titulo: "Circuito de Resolutividad", icono: "💡", descripcion: "Ideas y mejoras del equipo" },
  { id: "feedback", titulo: "Feedback Interfábricas", icono: "💬", descripcion: "Feedback entre compañeros" },
  { id: "compromisos", titulo: "Compromisos", icono: "🤝", descripcion: "Estado de compromisos por asesor" },
  { id: "confirmaciones_rol", titulo: "Confirmaciones de Rol", icono: "✅", descripcion: "Acompañamientos del coach" },
  { id: "quiz", titulo: "Quiz Semanal", icono: "📝", descripcion: "Presentación y aprobación" },
  { id: "estoy_enterado", titulo: "Estoy Enterado", icono: "📢", descripcion: "Seguimiento de briefings" },
]

// Orden de módulos para el rol híbrido "Coordinador Coach" (ej. Katheryne Quiñones)
const MODULOS_COORDINADOR_COACH = ["practicas_coach", "adherencia_pca", "confirmaciones_rol", "resolutividad"]

export default function PreviewPage() {
  const [email, setEmail] = useState("angelasilva.almacontact@outsourcing-account.com")
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState("")

  function cargar() {
    setCargando(true)
    setError("")
    fetch(`/api/jerarquia/test?email=${email}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error)
        else setPerfil(data)
      })
      .catch(() => setError("Error al cargar"))
      .finally(() => setCargando(false))
  }

  // Coordinador con cargo "Coordinador Coach": ve los mismos módulos que un
  // coach (su equipo de coaches agrupado) y conserva los filtros de coordinador/servicio.
  const esCoordinadorCoach = perfil?.rol === "coordinador"
    && (perfil.persona.cargo ?? "").toLowerCase().includes("coach")

  const idsVisibles = perfil
    ? new Set(MODULOS_POR_ROL[perfil.rol as keyof typeof MODULOS_POR_ROL] ?? [])
    : new Set<string>()

  const modulosVisibles = perfil
    ? esCoordinadorCoach
      ? MODULOS_COORDINADOR_COACH.map(id => TODOS_MODULOS.find(m => m.id === id)!).filter(Boolean)
      : TODOS_MODULOS.filter(m => idsVisibles.has(m.id))
    : []

  return (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-3 items-center">
          <span className="text-yellow-700 text-sm font-medium">⚠️ Modo Preview — solo desarrollo</span>
        </div>

        <div className="flex gap-3 mb-8">
          <input
            className="flex-1 bg-white border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="email@outsourcing-account.com"
          />
          <button
            onClick={cargar}
            disabled={cargando}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-5 py-2 rounded-lg transition disabled:opacity-50"
          >
            {cargando ? "Cargando..." : "Ver como este usuario"}
          </button>
        </div>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        {perfil && (
          <>
            <div className="mb-6 flex items-center gap-3">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{perfil.persona.nombre}</h2>
                <div className="flex gap-2 mt-1">
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full capitalize">{perfil.rol}</span>
                  <span className="text-xs text-gray-600">{perfil.persona.servicio}</span>
                  <span className="text-xs text-gray-600">{perfil.equipo.length} personas en equipo</span>
                </div>
              </div>
            </div>

            {/* Vista administrativa para admins */}
            {perfil.rol?.toLowerCase() === "admin" ? (
              <AdminView perfilAdmin={perfil} />
            ) : (
              <SemanaGlobalProvider>
                <div className="mb-4 flex justify-end">
                  <SemanaGlobalSelector light />
                </div>
                <PerfilProvider perfil={perfil} emailOverride={email}>
                  <div className="flex flex-col gap-2">
                    {modulosVisibles.map(m => (
                      <ModuloCard
                        key={m.id}
                        {...m}
                        equipo={perfil.equipo}
                        rol={perfil.rol}
                      />
                    ))}
                  </div>

                  {/* Vista de seguimiento de equipo para coaches (y coordinadores con rol híbrido de coach) */}
                  {(perfil.rol?.toLowerCase() === "coach" || esCoordinadorCoach) && (
                    <CoachTeamView perfilCoach={perfil} />
                  )}
                </PerfilProvider>
              </SemanaGlobalProvider>
            )}
          </>
        )}
      </div>
    </div>
  )
}
