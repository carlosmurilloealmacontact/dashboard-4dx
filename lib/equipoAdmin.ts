import type { Persona } from "@/lib/jerarquia"

// Duplicado deliberado de normalizarCargo() de lib/jerarquia.ts: este módulo lo
// importa components/AdminView.tsx ("use client"), y lib/jerarquia.ts arrastra
// lib/sheets.ts (googleapis/google-auth-library, dependen de módulos de Node
// como "fs"/"child_process") — importarlo como valor rompe el build del cliente.
export function normalizarCargo(cargo: string): string {
  const c = cargo.toLowerCase()
  if (c.includes("gerente") || c.includes("director")) return "gerente"
  if (c.includes("jefatura") || c.includes("jefe")) return "jefatura"
  if (c.includes("coordinador")) return "coordinador"
  if (c.includes("coach")) return "coach"
  if (c.includes("supervisor") || c.includes("lider") || c.includes("líder")) return "supervisor"
  if (c.includes("asesor") || c.includes("agente") || c.includes("aprendiz")) return "asesor"
  return "desconocido"
}

export const ROLES_DISPONIBLES = ["supervisor", "coordinador", "coach"]

// Duplicado deliberado de ROL_FORZADO de lib/jerarquia.ts (mismo motivo que
// normalizarCargo arriba). ALZATE ARROYAVE DANIEL FELIPE: cargo real "Jefe de
// Operación", pero se trata como coordinador en el panel.
const ROL_FORZADO: Record<string, string> = {
  "ALZATE ARROYAVE DANIEL FELIPE": "coordinador",
}

export const LIDERES = [
  "ADARMES FARIAS TEOLY KARLET",
  "AGUDELO BARRIENTOS MARIA CAMILA",
  "ALVAREZ CASTRO HEIDY STEFFANIA",
  "ALVAREZ PINEDA NEVY LUZ",
  "ARENAS MONCADA VALERIA",
  "BARRERA VALENCIA MARIA ALEJANDRA",
  "BEDOYA ESPINAL LUISA MERCEDES",
  "CARDONA BARRAGAN CATALINA",
  "CARVAJAL BARRERA LUCAS",
  "CASTRO RODRIGUEZ LUZ KARIME",
  "CEGUERI ACEVEDO DANY JAVIER",
  "CHAVARRIAGA GONZALEZ DIANA MARIA",
  "CORDOBA MORENO SEBASTIAN",
  "GARCIA ALVAREZ JONATHAN",
  "GIRALDO ARROYAVE GERALDIN",
  "GRAJALES MENA JESUS ENRIQUE",
  "HOYOS BERMUDEZ ARIANA",
  "JARAMILLO VASQUEZ DAVID",
  "LOPEZ ARANGO SANTIAGO",
  "LOPEZ SISO KEILLURY MAHOLI",
  "MARTINEZ PIEDRIZ MARIA SILVANA",
  "MENA CUESTA LAURA DANIELA",
  "MENDEZ DAZA YEINSY YOHANA",
  "ORIXAS CASTRO JHEISSON",
  "OROPEZA OROPEZA NIEVES HERYMAR",
  "OVALLES ORTEGANA YENNIFEER ANDREINA",
  "RAMIREZ RIOS LIZETH MELISSA",
  "RAMOS MIRANDA ANA SHAIRITH",
  "RIOS CELESTINO GERSON DARIO",
  "RIOS RAMIREZ JUAN ESTEBAN",
  "RODRIGUEZ RESTREPO KAREN DAYANNE",
  "RUA OLAYA JUAN PABLO",
  "RUBIO ORTIZ DIANA MARCELA",
  "SALAZAR SANMARTIN WENDY JOSEFINA",
  "SALDARRIAGA BIANT TIFFANI MELISSA",
  "SANDOVAL VARGAS JONATHAN",
  "SILVA ECHAVARRIA ANGELA MARIA",
  "STUMMO ARRIETA EVELIS TATIANA",
  "TORRES PEREZ YEFERSON",
  "TREJOS HINCAPIE MELISSA",
  "VASCO ALVAREZ EMANUEL ALEJANDRO",
  "VELASQUEZ CARTAGENA ALEJANDRO",
  "VILLA CADAVID JHON FERNANDO",
]

export const COACHES_PERMITIDOS = [
  "CARLA ROBERTA SPERCEL LEAL",
  "CLAUDIA LORETO VENEGAS MARTINEZ",
  "LOPEZ DIAZ CAROLINA ESTEFANIA",
  "PEREIRA MARCELA",
  "PEREZ NELSON ANDRES",
  "MURILLO CARMEN",
  "MYRYAM LUCERO CASTRO LINARES",
  "JULIAN ANDRES DIAZ RODRIGUEZ",
  "MAHIDE SOFIA SANTIAGO ESCORCIA",
  "ALISON MORENO MARIN",
  "Andrea Cristina Freitas",
  "ELIANA ANDREA HERRERA CARMONA",
  "Erika Juliette Angel Londoño",
  "Ivonne Mella",
]

/**
 * Aplica las reglas especiales por rol (listas de líderes/coaches permitidos,
 * coordinadores reales = jefes inmediatos de los 41 líderes, etc.). Es la
 * fuente única de verdad para "quién cuenta como X" en las vistas admin
 * (selector de Vista Admin y Panel de Control), para que ambas coincidan
 * siempre con el mismo criterio.
 */
export function filtrarPorRol(equipo: Persona[], rol: string): Persona[] {
  if (!rol) return equipo
  return equipo.filter(p => {
    const rolReal = ROL_FORZADO[p.nombre.toUpperCase().trim()] ?? normalizarCargo(p.cargo)
    if (rolReal !== rol) return false

    // Filtro especial para supervisores: solo los 41 líderes de la lista
    if (rol === "supervisor") {
      const nombre = p.nombre.toUpperCase().trim()
      return LIDERES.some(l => l.toUpperCase().trim() === nombre)
    }

    // Filtro especial para coaches: solo los 14 específicos + 2 admins
    if (rol === "coach") {
      const nombre = p.nombre.toUpperCase().trim()
      const coachEnLista = COACHES_PERMITIDOS.some(c => c.toUpperCase().trim() === nombre)
      const email = p.email.toLowerCase()
      const esAdmin = email === "carlosmurilloe.almacontact@outsourcing-account.com" ||
                     email === "mariarestrepoh.almacontact@outsourcing-account.com"
      return coachEnLista || esAdmin
    }

    // Para coordinadores: mostrar jefes inmediatos de los supervisores líderes
    if (rol === "coordinador") {
      const supervisoresLideres = equipo.filter(p => {
        const nombre = p.nombre.toUpperCase().trim()
        return LIDERES.some(l => l.toUpperCase().trim() === nombre)
      })
      const jefesUnicos = [...new Set(supervisoresLideres.map(s => s.jefeInmediato).filter(Boolean))]
      return jefesUnicos.some(jefe => jefe === p.nombre.toUpperCase().trim())
    }

    return true
  })
}

/**
 * Supervisores reales (los 41 líderes) a cargo de un coordinador dado, usando
 * la misma regla de match que `obtenerPerfil()` (coordinador O jefe_inmediato,
 * por la inconsistencia documentada de la columna "coordinador" en la hoja).
 */
export function supervisoresDeCoordinador(equipo: Persona[], nombreCoordinador: string): Persona[] {
  const nombreLower = nombreCoordinador.toLowerCase().trim()
  const lideres = filtrarPorRol(equipo, "supervisor")
  return lideres.filter(p =>
    (p.coordinador ?? "").toLowerCase().trim() === nombreLower
    || (p.jefeInmediato ?? "").toLowerCase().trim() === nombreLower
  ).sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? "", "es", { sensitivity: "base" }))
}
