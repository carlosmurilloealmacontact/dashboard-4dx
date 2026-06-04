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

    // Los 6 coordinadores activos
    const coordinadoresActivos = [
      "ROJAS LEGUIZAMO ANDRES FELIPE",
      "HERNANDEZ URREGO CRISTIAN ENRIQUE",
      "MARTINEZ PEREZ JHON ALEXANDER",
      "MONSALVE HERRERA JOHN JAMES",
      "LOBO VERA LADY VANESSA",
      "CARBONO PEDROZA YINEIDIS YESENIA"
    ]

    // Obtener solo los coordinadores activos
    const coordinadoresMap = new Map()

    activos
      .filter(p => {
        const cargo = (p.cargo ?? "").toLowerCase()
        const nombre = p.nombre ?? ""

        // Verificar cargo
        const esCoord = cargo.includes("coordinador") || cargo.includes("jefatura") || cargo.includes("jefe")

        // Verificar que esté en la lista de coordinadores activos
        const esActivo = coordinadoresActivos.includes(nombre)

        return esCoord && esActivo
      })
      .filter(p => p.emailCorporativo || p.email)
      .forEach(p => {
        const email = p.emailCorporativo || p.email
        if (!coordinadoresMap.has(email)) {
          coordinadoresMap.set(email, {
            nombre: p.nombre,
            email,
            servicio: p.servicio ?? "",
            area: p.area ?? "",
          })
        }
      })

    const coordinadores = Array.from(coordinadoresMap.values())
      .sort((a, b) => a.nombre.localeCompare(b.nombre))

    // Para cada coordinador, obtener los servicios de sus supervisores directos
    const coordinadoresConServicios = coordinadores.map(coord => {
      const supervisoresDelCoord = activos.filter(p => {
        const cargo = (p.cargo ?? "").toLowerCase()
        const jefeDelCoord = (p.jefeInmediato ?? "").toLowerCase().trim() === coord.nombre.toLowerCase().trim()
        return cargo.includes("supervisor") && jefeDelCoord
      })

      const servicios = [...new Set(
        supervisoresDelCoord.map(s => s.servicio).filter(Boolean)
      )].sort()

      return { ...coord, servicios }
    })

    return NextResponse.json({ coordinadores: coordinadoresConServicios })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
