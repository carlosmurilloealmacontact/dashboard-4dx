import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { cargarPersonas, normalizarCargo } from "@/lib/jerarquia"

// Ruta temporal de diagnóstico — eliminar en producción
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const todos = await cargarPersonas(session.accessToken)
  const activos = todos.filter(p => p.estado.toLowerCase() !== "retiro")
  const conEmail = activos.filter(p => p.email.trim() !== "")

  const porCargo = conEmail.reduce((acc, p) => {
    const rol = normalizarCargo(p.cargo)
    acc[rol] = (acc[rol] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const conEmailCorp = activos.filter(p => p.emailCorporativo.trim() !== "")

  // Muestra 3 ejemplos de supervisores con email corporativo
  const ejemplos = conEmailCorp
    .filter(p => normalizarCargo(p.cargo) === "supervisor")
    .slice(0, 3)
    .map(p => ({ nombre: p.nombre, cargo: p.cargo, emailCorporativo: p.emailCorporativo }))

  return NextResponse.json({
    totalRegistros: todos.length,
    totalActivos: activos.length,
    conEmail: conEmail.length,
    conEmailCorporativo: conEmailCorp.length,
    distribucionRoles: porCargo,
    ejemplosSupervisores: ejemplos,
  })
}
