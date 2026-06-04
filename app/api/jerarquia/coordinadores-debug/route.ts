import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { cargarPersonas } from "@/lib/jerarquia"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  try {
    const todos = await cargarPersonas(session.accessToken)
    const activos = todos.filter(p => (p.estado ?? "").toLowerCase() !== "retiro")

    // Mostrar todos los coordinadores con sus datos completos
    const coordinadores = activos
      .filter(p => {
        const cargo = (p.cargo ?? "").toLowerCase()
        return cargo.includes("coordinador") || cargo.includes("jefatura") || cargo.includes("jefe")
      })
      .map(p => ({
        nombre: p.nombre,
        cargo: p.cargo,
        gerencia: p.gerencia,
        coordinador: p.coordinador,
        email: p.emailCorporativo || p.email,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))

    // Valores únicos de gerencia
    const gerenciasUnicas = [...new Set(
      activos
        .filter(p => {
          const cargo = (p.cargo ?? "").toLowerCase()
          return cargo.includes("coordinador") || cargo.includes("jefatura") || cargo.includes("jefe")
        })
        .map(p => p.gerencia)
        .filter(Boolean)
    )].sort()

    return NextResponse.json({ coordinadores, gerenciasUnicas })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
