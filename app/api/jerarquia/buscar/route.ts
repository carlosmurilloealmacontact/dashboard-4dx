import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { cargarPersonas } from "@/lib/jerarquia"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const q = (req.nextUrl.searchParams.get("q") ?? "").toLowerCase()
  if (!q) return NextResponse.json({ error: "Falta parámetro q" }, { status: 400 })

  const todos = await cargarPersonas(session.accessToken)
  const activos = todos.filter(p => (p.estado ?? "").toLowerCase() !== "retiro")

  const resultados = activos
    .filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      p.emailCorporativo.toLowerCase().includes(q)
    )
    .slice(0, 10)
    .map(p => ({ nombre: p.nombre, cargo: p.cargo, email: p.email, emailCorporativo: p.emailCorporativo, usuarioLatam: p.usuarioLatam }))

  return NextResponse.json({ resultados })
}
