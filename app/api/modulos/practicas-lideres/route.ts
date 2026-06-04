import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { obtenerPerfil } from "@/lib/jerarquia"
import { getPracticasLideres } from "@/lib/practicasLideres"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken || !session?.user?.email)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const perfil = await obtenerPerfil(session.accessToken, session.user.email)
  if (!perfil) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })

  try {
    const data = await getPracticasLideres(session.accessToken, perfil)
    if (!data) return NextResponse.json({ error: "Sin datos" }, { status: 404 })
    return NextResponse.json(data)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
