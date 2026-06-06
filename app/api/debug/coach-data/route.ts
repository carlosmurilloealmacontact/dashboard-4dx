import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"
import { obtenerPerfil } from "@/lib/jerarquia"
import fs from "fs"
import path from "path"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const emailOverride = req.nextUrl.searchParams.get("email")
  const email = emailOverride ?? session.user?.email ?? ""
  const perfil = await obtenerPerfil(session.accessToken, email)
  if (!perfil) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })

  const nombrePersona = (perfil.persona.nombre ?? "").toLowerCase().trim()

  try {
    // 1. Seguimiento Coach
    const seguimientoRows = await getSheetData(
      session.accessToken,
      "1UN-wQKOh1z9M4K4LUJiY1prj26Lo2taVR-szVhx-Gso",
      "Seguimiento_LiderCoach_8Sem!A:K"
    )
    const segHeaders = seguimientoRows[0] ?? []
    const iLider = segHeaders.findIndex(h =>
      (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === "lider coach"
    )
    const seguimientoMatches = seguimientoRows.slice(1)
      .filter(r => iLider >= 0 && (r[iLider] ?? "").toLowerCase().trim() === nombrePersona)
      .length

    // 2. Adherencia PCA
    const adherenciaRows = await getSheetData(
      session.accessToken,
      "1MZiP7K4JbElp3lM2n0Tr554WNN1RTfGlsgCB9uJ8tSw",
      "Detalle Eventos!A:P"
    )
    const adhHeaders = adherenciaRows[0] ?? []
    const iNombre = adhHeaders.findIndex(h =>
      (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === "nombre"
    )
    const adherenciaMatches = adherenciaRows.slice(1)
      .filter(r => iNombre >= 0 && (r[iNombre] ?? "").toLowerCase().trim() === nombrePersona)
      .length

    // 3. Confirmaciones de Rol
    const confirmRows = await getSheetData(
      session.accessToken,
      "1UN-wQKOh1z9M4K4LUJiY1prj26Lo2taVR-szVhx-Gso",
      "Confirmaciones de Rol!A:BJ"
    )
    const confirmHeaders = confirmRows[0] ?? []
    let iNombreCoach = -1
    const nombrePositions: number[] = []
    for (let i = 0; i < confirmHeaders.length; i++) {
      if ((confirmHeaders[i] ?? "").toLowerCase().trim() === "nombre") {
        nombrePositions.push(i)
      }
    }
    if (nombrePositions.length > 0) {
      iNombreCoach = nombrePositions.reduce((closest, current) =>
        Math.abs(current - 45) < Math.abs(closest - 45) ? current : closest
      )
    }
    const confirmMatches = confirmRows.slice(1)
      .filter(r => iNombreCoach >= 0 && (r[iNombreCoach] ?? "").toLowerCase().trim() === nombrePersona)
      .length

    const resultado = {
      perfil: {
        nombre: perfil.persona.nombre,
        nombreNormalizado: nombrePersona,
        rol: perfil.rol,
        email: perfil.persona.emailCorporativo,
      },
      seguimientoCoach: {
        sheetRows: seguimientoRows.length - 1,
        headerCount: segHeaders.length,
        iLiderFound: iLider,
        iLiderValue: iLider >= 0 ? segHeaders[iLider] : "NOT FOUND",
        primeros5: seguimientoRows.slice(1, 6).map(r => ({
          nombre: r[iLider] ?? "",
          nombreNormalizado: (r[iLider] ?? "").toLowerCase().trim(),
        })),
        matches: seguimientoMatches,
      },
      adherenciaPCA: {
        sheetRows: adherenciaRows.length - 1,
        headers: adhHeaders,
        iNombreFound: iNombre,
        iNombreValue: iNombre >= 0 ? adhHeaders[iNombre] : "NOT FOUND",
        iSemana: adhHeaders.findIndex(h => (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim() === "semana"),
        iFecha: adhHeaders.findIndex(h => (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim() === "fecha"),
        iTotal: adhHeaders.findIndex(h => (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim() === "total gestion dia"),
        iCumple: adhHeaders.findIndex(h => (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim() === "cumplimiento dia"),
        primeros5: adherenciaRows.slice(1, 6).map(r => ({
          nombre: r[iNombre] ?? "",
          nombreNormalizado: (r[iNombre] ?? "").toLowerCase().trim(),
        })),
        matches: adherenciaMatches,
      },
      confirmacionesRol: {
        sheetRows: confirmRows.length - 1,
        headerCount: confirmHeaders.length,
        iNombreCoachFound: iNombreCoach,
        iNombreCoachValue: iNombreCoach >= 0 ? confirmHeaders[iNombreCoach] : "NOT FOUND",
        nombrePositions,
        primeros5: confirmRows.slice(1, 6).map(r => ({
          nombre: r[iNombreCoach] ?? "",
          nombreNormalizado: (r[iNombreCoach] ?? "").toLowerCase().trim(),
        })),
        matches: confirmMatches,
      },
    }

    // Write to local file for offline inspection (dev only)
    try {
      const outPath = path.join(process.cwd(), ".next", "debug-coach-data.json")
      fs.writeFileSync(outPath, JSON.stringify(resultado, null, 2), "utf-8")
    } catch { /* ignore write errors */ }

    return NextResponse.json(resultado)
  } catch (e: unknown) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}
