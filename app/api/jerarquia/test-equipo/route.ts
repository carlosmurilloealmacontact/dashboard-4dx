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

    // Buscar Angela
    const angela = activos.find(p =>
      (p.emailCorporativo ?? "").toLowerCase().includes("angelasilva") ||
      (p.nombre ?? "").toLowerCase().includes("silva echavarria")
    )

    if (!angela) return NextResponse.json({ error: "Angela no encontrada" })

    const nombreAngelaLower = (angela.nombre ?? "").toLowerCase().trim()

    // Ver cuántas personas tienen a Angela como jefe inmediato
    const equipo = activos.filter(p =>
      (p.jefeInmediato ?? "").toLowerCase().trim() === nombreAngelaLower
    )

    // Contar duplicados por nombre
    const contarDuplicados = (arr: any[]) => {
      const map = new Map()
      arr.forEach(p => {
        const nombre = p.nombre ?? ""
        map.set(nombre, (map.get(nombre) || 0) + 1)
      })
      return Array.from(map.entries()).filter(([_, count]) => count > 1)
    }

    const duplicados = contarDuplicados(equipo)

    // Listar primeros 10
    const primeros10 = equipo.slice(0, 10).map(p => ({
      nombre: p.nombre,
      cedula: p.cedula,
      cargo: p.cargo,
      email: p.emailCorporativo || p.email,
    }))

    return NextResponse.json({
      angelaNombre: angela.nombre,
      equipoTotal: equipo.length,
      duplicados: duplicados.length > 0 ? duplicados : "Sin duplicados",
      primeros10,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
