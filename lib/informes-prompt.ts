import type { DatosInforme } from "@/lib/informes"

/**
 * Construye el prompt para que la IA redacte el análisis narrativo del informe
 * de cumplimiento (Compromisos 4DX, Quiz Semanal, Feedback Interfábricas y
 * Resolutividad/CDR), a partir de los datos ya agregados por construirDatosInforme().
 */
export function construirPromptInforme(
  tipoInforme: "parcial" | "cierre",
  datos: DatosInforme,
): string {
  const { alcance, semanas, porSupervisor } = datos
  const ultimaSemana = semanas[semanas.length - 1]

  const contextoTipo = tipoInforme === "parcial"
    ? `Este es un informe PARCIAL de la semana ${ultimaSemana} (semana en curso, aún no ha cerrado). ` +
      `Es normal que "Compromisos" todavía tenga ítems "abiertos" sin pasar a "cerrado con mejora": no lo trates ` +
      `como una caída si la tendencia muestra menos cerrados con mejora que la semana pasada, ya que esa semana ya había cerrado. ` +
      `En cambio, sí son señales relevantes: % sin ingreso alto o creciente, baja presentación/aprobación del quiz, ` +
      `y feedbacks nuevos sin gestionar — esto el coordinador SÍ puede accionar antes de que cierre la semana.`
    : `Este es un informe de CIERRE de la semana ${ultimaSemana} (semana ya finalizada). ` +
      `Aquí sí interesa el resultado final: % de compromisos cerrados con mejora vs. cerrados sin mejora vs. sin ingreso, ` +
      `y la comparación contra la semana anterior para ver evolución real.`

  const alcanceTxt = alcance.tipo === "coordinador"
    ? `el equipo completo del coordinador ${alcance.nombre} (todos sus supervisores)`
    : `el equipo del supervisor ${alcance.nombre}`

  const datosJson = JSON.stringify(porSupervisor, null, 2)

  return `Eres un analista que apoya a un coordinador de call center a interpretar los resultados semanales de su equipo en 4 prácticas de gestión:

1. **Compromisos 4DX** (compromisos): cada asesor registra un compromiso semanal. Categorías: "sinIngreso" (no registró nada — riesgo, meta es 0), "abiertos" (en curso), "cerradoMejora" (cerró con cumplimiento/mejora — lo deseable), "cerradoSin" (cerró sin cumplir).
2. **Quiz Semanal** (quiz): "presento"/"noPresento" indica si el asesor presentó el quiz (meta: 100% presenta), y "aprueba" cuántos de los que presentaron aprobaron (puntuación >= 30).
3. **Feedback Interfábricas** (feedback): "nuevos" son feedbacks recibidos sin gestionar todavía (meta: 0 acumulados sin gestión), "gestionados" ya se atendieron, "rechazados" se declinaron.
4. **Resolutividad / CDR** (resolutividad): ideas de mejora del equipo. "pctImpl" = % de ideas seleccionadas para implementar (meta orientativa ≥23%), "pctBacklog" = % de ideas ya aplicadas/backlog (meta ≤10%). Es un acumulado histórico, no por semana.

Cada supervisor trae un campo "tendencia" que compara la(s) métrica(s) de "${semanas.length > 1 ? `la última semana (${ultimaSemana})` : `la semana ${ultimaSemana}`}" contra la semana inmediatamente anterior, con dirección "mejora" / "empeora" / "igual" ya calculada (ya considera qué dirección es positiva para cada métrica).

${contextoTipo}

Alcance de este informe: ${alcanceTxt}.
Semana(s) reportada(s): ${semanas.join(", ")}.

Datos agregados por supervisor (JSON):
${datosJson}

Con base en estos datos, escribe un informe en español, claro y accionable, con esta estructura:

## Resumen ejecutivo
2-3 frases con el panorama general del equipo en esta(s) semana(s).

## Compromisos 4DX
- **Focos** (riesgo: % sin ingreso alto o tendencia "empeora" en sinIngreso/cerradoMejora): nombra a los supervisores en riesgo y por qué.
- **Sin mejora** (estancados: tendencia "igual" semana a semana en sus métricas clave).
- **Cumple bien** (tendencia "mejora" o métricas ya sólidas): reconoce a quienes van bien.

## Quiz Semanal
Mismo formato (Focos / Sin mejora / Cumple bien), basado en % presentación y % aprobación.

## Feedback Interfábricas
Mismo formato, basado en feedbacks "nuevos" sin gestionar y su tendencia.

## Resolutividad / CDR
Mismo formato, basado en pctImpl (meta ≥23%) y pctBacklog (meta ≤10%). Si "resolutividad" es null para un supervisor, indica que no tiene ideas registradas.

## Plan de acción
3-5 acciones concretas y priorizadas que el coordinador debería tomar esta semana con sus supervisores para mover las métricas, mencionando supervisores y prácticas específicas.

Reglas de estilo:
- Sé directo y específico, usa los nombres de los supervisores tal como aparecen en los datos (puedes acortarlos a las primeras 2-3 palabras).
- Si en una práctica TODOS los supervisores van bien, dilo brevemente y no inventes "focos" artificiales.
- Si faltan datos (null) para un supervisor en alguna práctica, no lo incluyas en esa sección.
- No repitas el JSON ni expliques la metodología, ve directo al análisis.`
}
