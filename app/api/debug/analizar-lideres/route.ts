import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import { cargarPersonas, normalizarCargo } from "@/lib/jerarquia"
import { NextResponse } from "next/server"

const LIDERES = [
  "CARVAJAL BARRERA LUCAS",
  "ARENAS MONCADA VALERIA",
  "VELASQUEZ CARTAGENA ALEJANDRO",
  "SILVA ECHAVARRIA ANGELA MARIA",
  "HOYOS BERMUDEZ ARIANA",
  "RAMOS MIRANDA ANA SHAIRITH",
  "CARDONA BARRAGAN CATALINA",
  "CEGUERI ACEVEDO DANY JAVIER",
  "CHAVARRIAGA GONZALEZ DIANA MARIA",
  "JARAMILLO VASQUEZ DAVID",
  "RUBIO ORTIZ DIANA MARCELA",
  "STUMMO ARRIETA EVELIS TATIANA",
  "VASCO ALVAREZ EMANUEL ALEJANDRO",
  "RIOS RAMIREZ JUAN ESTEBAN",
  "GIRALDO ARROYAVE GERALDIN",
  "RIOS CELESTINO GERSON DARIO",
  "ALVAREZ CASTRO HEIDY STEFFANIA",
  "VILLA CADAVID JHON FERNANDO",
  "ORIXAS CASTRO JHEISSON",
  "RUA OLAYA JUAN PABLO",
  "SANDOVAL VARGAS JONATHAN",
  "RODRIGUEZ RESTREPO KAREN DAYANNE",
  "LOPEZ SISO KEILLURY MAHOLI",
  "MENA CUESTA LAURA DANIELA",
  "BEDOYA ESPINAL LUISA MERCEDES",
  "GRAJALES MENA JESUS ENRIQUE",
  "CASTRO RODRIGUEZ LUZ KARIME",
  "RAMIREZ RIOS LIZETH MELISSA",
  "BARRERA VALENCIA MARIA ALEJANDRA",
  "AGUDELO BARRIENTOS MARIA CAMILA",
  "TREJOS HINCAPIE MELISSA",
  "MARTINEZ PIEDRIZ MARIA SILVANA",
  "OROPEZA OROPEZA NIEVES HERYMAR",
  "ALVAREZ PINEDA NEVY LUZ",
  "CORDOBA MORENO SEBASTIAN",
  "ADARMES FARIAS TEOLY KARLET",
  "SALDARRIAGA BIANT TIFFANI MELISSA",
  "SALAZAR SANMARTIN WENDY JOSEFINA",
  "MENDEZ DAZA YEINSY YOHANA",
  "OVALLES ORTEGANA YENNIFEER ANDREINA",
  "TORRES PEREZ YEFERSON",
]

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const personas = await cargarPersonas(session.accessToken)
    const activos = personas.filter(p => (p.estado ?? "").toLowerCase() !== "retiro")

    // Buscar los líderes en la base de datos
    const lideresEncontrados = LIDERES.map(nombre => {
      const found = activos.find(p => p.nombre.toUpperCase().trim() === nombre.toUpperCase().trim())
      return {
        nombre,
        encontrado: !!found,
        cargo: found?.cargo || null,
        rol: found ? normalizarCargo(found.cargo) : null,
        servicio: found?.servicio || null,
        servicio_: found?.servicio_ || null,
        usuarioLatam: found?.usuarioLatam || null,
        email: found?.email || null,
        emailCorporativo: found?.emailCorporativo || null,
        estado: found?.estado || null,
        area: found?.area || null,
      }
    })

    // Analizar patrones
    const encontrados = lideresEncontrados.filter(l => l.encontrado)
    const noEncontrados = lideresEncontrados.filter(l => !l.encontrado)

    const stats = {
      total: LIDERES.length,
      encontrados: encontrados.length,
      noEncontrados: noEncontrados.length,
      rolesUnicos: [...new Set(encontrados.map(l => l.rol))],
      serviciosUnicos: [...new Set(encontrados.map(l => l.servicio).filter(Boolean))],
      areasUnicas: [...new Set(encontrados.map(l => l.area).filter(Boolean))],
      tienenUsuarioLatam: encontrados.filter(l => l.usuarioLatam).length,
      tienenEmailLatam: encontrados.filter(l => l.email?.includes("@latam.com")).length,
    }

    return NextResponse.json({
      stats,
      encontrados,
      noEncontrados,
    })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
