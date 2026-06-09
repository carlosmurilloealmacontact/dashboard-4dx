import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"

const SHEET_ID = "1tmFJQ4EJaUTCbogu11klf7GSzXpzevn7gw3U84Rw3zM"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  try {
    // 1. Hoja Metas
    const metasRows = await getSheetData(session.accessToken, SHEET_ID, "Metas!A:Z")
    const metasHeaders = metasRows[0] ?? []
    const metasMuestra = metasRows.slice(0, 30) // encabezado + primeras filas

    // 2. Datos: distribución de la columna Jefatura (Y)
    const datosRows = await getSheetData(session.accessToken, SHEET_ID, "Datos!A:Z")
    const datosHeaders = datosRows[0] ?? []
    const iJefatura = datosHeaders.findIndex(h => (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim() === "jefatura")
    const jefaturasUnicas = iJefatura >= 0
      ? [...new Set(datosRows.slice(1).map(r => (r[iJefatura] ?? "").trim()).filter(Boolean))]
      : []

    return NextResponse.json({
      metas: {
        headers: metasHeaders,
        headerCount: metasHeaders.length,
        muestraFilas: metasMuestra,
      },
      datos: {
        datosHeaders,
        iJefatura,
        jefaturaHeaderValue: iJefatura >= 0 ? datosHeaders[iJefatura] : "NOT FOUND",
        jefaturasUnicas,
      },
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
