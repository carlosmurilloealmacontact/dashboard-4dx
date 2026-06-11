import type { RolNormalizado } from "@/lib/jerarquia"

export type Jerarquia = "AMX" | "LATAM"

// Lo que cada rol puede ver en el panel
export const MODULOS_POR_ROL: Record<RolNormalizado, string[]> = {
  desconocido: [],
  asesor: [],

  supervisor: [
    "adherencia",
    "practicas_lideres",
    "adherencia_pca",
    "confirmaciones_rol",
    "compromisos",
    "quiz",
    "estoy_enterado",
    "feedback",
    "resolutividad",
    "pausas_4dx",
    "agenda_lider",
  ],
  coach: [
    "practicas_coach",
    "adherencia_pca",
    "confirmaciones_rol",
  ],
  coordinador: [
    "adherencia",
    "practicas_lideres",
    "confirmaciones_rol",
    "compromisos",
    "quiz",
    "estoy_enterado",
    "feedback",
    "resolutividad",
    "adherencia_pca",
    "pausas_4dx",
    "agenda_lider",
  ],
  jefatura: [
    "practicas_coach",
    "confirmaciones_rol",
    "adherencia_pca",
    "resolutividad",
    "pausas_4dx",
    "agenda_lider",
  ],
  gerente: [
    "adherencia",
    "practicas_lideres",
    "practicas_coach",
    "confirmaciones_rol",
    "compromisos",
    "quiz",
    "estoy_enterado",
    "feedback",
    "resolutividad",
    "adherencia_pca",
    "pausas_4dx",
    "agenda_lider",
  ],
  admin: [
    "confirmaciones_rol",
    "pausas_4dx",
    "adherencia_pca",
  ],
}
