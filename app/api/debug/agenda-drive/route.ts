import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { obtenerPerfil, normalizarCargo } from "@/lib/jerarquia"
import { getDriveClient, obtenerAgendaLider, nombresCoinciden } from "@/lib/drive"

const CARPETA_RAIZ_AGENDA = "1LqXqtOOydr-qB4KTWWp0t8SCC_rivZjl"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const email = session.user?.email ?? ""
  const perfil = await obtenerPerfil(session.accessToken, email)
  if (!perfil || perfil.rol !== "admin") {
    return NextResponse.json({ error: "Solo admins" }, { status: 403 })
  }

  const nombreCoord = req.nextUrl.searchParams.get("coordinador") ?? ""

  try {
    const drive = await getDriveClient(session.accessToken)

    const carpetasRes = await drive.files.list({
      q: `'${CARPETA_RAIZ_AGENDA}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name)",
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    const carpetas = carpetasRes.data.files ?? []

    let archivosCarpetaCoord: { id?: string | null; name?: string | null; modifiedTime?: string | null }[] = []
    let carpetaCoordNombre: string | null = null
    if (nombreCoord) {
      const carpetaCoord = carpetas.find(c => {
        const nombreCarpeta = (c.name ?? "").replace(/^equipo\s+/i, "")
        return nombresCoinciden(nombreCoord, nombreCarpeta)
      })

      if (carpetaCoord?.id) {
        carpetaCoordNombre = carpetaCoord.name ?? null
        const archivosRes = await drive.files.list({
          q: `'${carpetaCoord.id}' in parents and trashed = false`,
          fields: "files(id, name, modifiedTime)",
          pageSize: 1000,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        })
        archivosCarpetaCoord = archivosRes.data.files ?? []
      }
    }

    const nombreCoordNorm = nombreCoord.toLowerCase().trim()
    const supervisores = nombreCoord
      ? perfil.equipo.filter(p =>
          (p.coordinador ?? "").toLowerCase().trim() === nombreCoordNorm
          && normalizarCargo(p.cargo) === "supervisor"
        )
      : []
    const resultado = nombreCoord
      ? Object.fromEntries(await obtenerAgendaLider(session.accessToken, nombreCoord, supervisores.map(s => s.nombre)))
      : {}

    return NextResponse.json({
      nombreCoordBuscado: nombreCoord,
      carpetasEnRaiz: carpetas.map(c => c.name),
      carpetaCoordEncontrada: carpetaCoordNombre,
      archivosEnCarpetaCoord: archivosCarpetaCoord.map(a => a.name),
      nombresSupervisores: supervisores.map(s => s.nombre),
      resultadoMatch: resultado,
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
