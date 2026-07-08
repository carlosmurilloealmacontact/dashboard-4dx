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

export const LIDERES = [
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
    if (normalizarCargo(p.cargo) !== rol) return false

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
  )
}
