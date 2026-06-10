import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { obtenerPerfil } from "@/lib/jerarquia"
import { getPracticasLideres } from "@/lib/practicasLideres"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const email = req.nextUrl.searchParams.get("email") ?? session.user?.email ?? ""
  const semanaParam = req.nextUrl.searchParams.get("semana")
  const servicioParam = req.nextUrl.searchParams.get("servicio")
  const perfil = await obtenerPerfil(session.accessToken, email)
  if (!perfil) return NextResponse.json({ error: `No encontrado: ${email}` }, { status: 404 })

  try {
    const data = await getPracticasLideres(session.accessToken, perfil, semanaParam, servicioParam)
    if (!data) return NextResponse.json({ error: "Sin datos" }, { status: 404 })
    const res = NextResponse.json(data)
    res.headers.set("Cache-Control", "no-store")
    return res
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
