"use client"

import { signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import ModuloCard from "@/components/ModuloCard"
import CoachTeamView from "@/components/CoachTeamView"
import AdminView from "@/components/AdminView"
import { usePerfil } from "@/hooks/usePerfil"
import { MODULOS_POR_ROL } from "@/lib/roles"

const MODULOS = [
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

const ETIQUETAS_ROL: Record<string, string> = {
  gerente: "Gerente",
  jefatura: "Jefatura",
  coordinador: "Coordinador",
  coach: "Coach",
  supervisor: "Supervisor",
  asesor: "Asesor",
  desconocido: "Usuario",
}

export default function DashboardPage() {
  const { perfil, cargando, error, session } = usePerfil()
  const router = useRouter()

  useEffect(() => {
    if (!session && !cargando) router.push("/login")
  }, [session, cargando, router])

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-gray-400 text-sm">Cargando tu panel...</div>
      </div>
    )
  }

  if (!session) return null

  // Módulos visibles según el rol
  const modulosVisibles = perfil
    ? TODOS_MODULOS.filter(m => MODULOS_POR_ROL[perfil.rol]?.includes(m.id))
    : TODOS_MODULOS

  const nombreCorto = perfil?.persona.nombre.split(" ")[0] ?? session.user?.name?.split(" ")[0] ?? "Usuario"
  const etiquetaRol = perfil ? ETIQUETAS_ROL[perfil.rol] : ""
  const totalEquipo = perfil?.equipo.length ?? 0

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Dashboard 4DX</h1>
          <p className="text-xs text-gray-500">Almaexperience</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm text-white">{perfil?.persona.nombre ?? session.user?.name}</p>
            <div className="flex items-center gap-2 justify-end">
              {etiquetaRol && (
                <span className="text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded-full">
                  {etiquetaRol}
                </span>
              )}
              {perfil?.persona.servicio && (
                <span className="text-xs text-gray-500">{perfil.persona.servicio}</span>
              )}
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-xs text-gray-500 hover:text-white transition"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="px-6 py-8 max-w-7xl mx-auto">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white">Hola, {nombreCorto} 👋</h2>
          {error ? (
            <p className="text-yellow-500 text-sm mt-1">
              ⚠️ Tu usuario no está en la base de datos — contacta a tu coordinador.
            </p>
          ) : (
            <p className="text-gray-400 text-sm mt-1">
              {totalEquipo > 0
                ? `Tu equipo tiene ${totalEquipo} persona${totalEquipo !== 1 ? "s" : ""} — aquí tienes su resumen.`
                : "Aquí tienes el resumen de tu panel."}
            </p>
          )}
        </div>

        {modulosVisibles.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {modulosVisibles.map((modulo) => (
              <ModuloCard
                key={modulo.id}
                {...modulo}
                equipo={perfil?.equipo ?? []}
                rol={perfil?.rol ?? "desconocido"}
              />
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No hay módulos configurados para tu rol.</p>
        )}

        {/* Vista de seguimiento para coaches */}
        {perfil?.rol?.toLowerCase() === "coach" ? (
          <CoachTeamView perfilCoach={perfil} />
        ) : null}

        {/* Vista administrativa para admins */}
        {perfil?.rol?.toLowerCase() === "admin" ? (
          <AdminView perfilAdmin={perfil} />
        ) : null}

        <div className="mt-8 text-center text-xs text-gray-600">
          [Fin de página - rol: {perfil?.rol?.toLowerCase()}]
        </div>
      </main>
    </div>
  )
}
