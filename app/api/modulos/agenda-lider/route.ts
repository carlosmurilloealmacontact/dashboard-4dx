import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { obtenerPerfil } from "@/lib/jerarquia"
import { obtenerAgendaLider } from "@/lib/drive"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const emailOverride = req.nextUrl.searchParams.get("email")
  const email = emailOverride ?? session.user?.email ?? ""
  const perfil = await obtenerPerfil(session.accessToken, email)
  if (!perfil) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })

  const esCoord = ["coordinador", "jefatura", "gerente", "admin"].includes(perfil.rol)

  if (esCoord) {
    const nombresSupervisores = perfil.supervisores.map(s => s.nombre)
    const mapa = await obtenerAgendaLider(session.accessToken, perfil.persona.nombre, nombresSupervisores)
    const equipo = perfil.supervisores.map(s => {
      const info = mapa.get(s.nombre)
      return {
        supervisor: s.nombre,
        archivo: info?.archivo ?? null,
        ultimaModificacion: info?.ultimaModificacion ?? null,
        diasDesdeModificacion: info?.diasDesdeModificacion ?? null,
        alerta: info?.alerta ?? null,
      }
    })

    const response = NextResponse.json({ esCoord: true, equipo })
    response.headers.set("Cache-Control", "no-store")
    return response
  }

  if (perfil.rol === "supervisor") {
    const mapa = await obtenerAgendaLider(session.accessToken, perfil.persona.coordinador, [perfil.persona.nombre])
    const info = mapa.get(perfil.persona.nombre)
    const propio = info
      ? {
          archivo: info.archivo,
          ultimaModificacion: info.ultimaModificacion,
          diasDesdeModificacion: info.diasDesdeModificacion,
          alerta: info.alerta,
        }
      : null

    const response = NextResponse.json({ esCoord: false, propio })
    response.headers.set("Cache-Control", "no-store")
    return response
  }

  const response = NextResponse.json({ esCoord: false, propio: null })
  response.headers.set("Cache-Control", "no-store")
  return response
}
