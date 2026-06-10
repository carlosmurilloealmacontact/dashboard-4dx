# CONTEXT.md — Dashboard 4DX

Última actualización: 2026-06-09

---

## Objetivo

Dashboard interno para el equipo Almaexperience / LATAM que centraliza métricas
semanales por rol (asesor → supervisor → coordinador → coach → jefatura → admin).
Los datos se leen en tiempo real desde Google Sheets mediante la API de Google.
Auth vía NextAuth + Google OAuth2 (tokens persistidos en DB para refresh).

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16.2.7 (Turbopack, App Router) |
| Lenguaje | TypeScript |
| Auth | NextAuth v4 — JWT strategy + OAuth2 refresh |
| Datos | Google Sheets API (googleapis) |
| DB | SQLite vía better-sqlite3 (`lib/db.ts`) — almacena tokens |
| Estilos | Tailwind CSS |
| Deploy | Vercel |

> **AVISO:** Esta versión de Next.js tiene breaking changes. Leer
> `node_modules/next/dist/docs/` antes de escribir código nuevo.

---

## Arquitectura general

```
app/
  page.tsx                  ← Dashboard principal (auth real)
  login/page.tsx
  demo/page.tsx             ← Demo por rol (datos mock de jerarquía)
  demo/real/page.tsx        ← Demo con datos reales (3 usuarios fijos)
  preview/page.tsx          ← Dev: cualquier email → simula vista
  api/
    auth/[...nextauth]/     ← NextAuth + refresh token
    auth/logout/            ← Borra token de BD
    jerarquia/              ← /test  /coordinadores
    modulos/
      adherencia-4dx/
      adherencia-pca/
      confirmaciones-rol/
      practicas-lideres/    ← + /test
      quiz/
      resolutividad/
      compromisos/
      feedback/
      estoy-enterado/
      seguimiento-coach/
    debug/
      coach-data/
      practicas-lideres/
      metas-resolutividad/

components/
  ModuloCard.tsx            ← Wrapper que carga el componente del módulo
  AdminView.tsx             ← Vista admin con filtros rol/servicio/persona
  CoachTeamView.tsx         ← Vista coach: selección coordinador+servicio → cards
  SemanaGlobalSelector.tsx  ← Dropdown único de semana (prop light para bg blanco)
  modulos/
    Adherencia4DX.tsx
    AdherenciaPCA.tsx
    ConfirmacionesRol.tsx
    PracticasLideres.tsx
    QuizSemanal.tsx
    Resolutividad.tsx
    Compromisos.tsx
    Feedback.tsx
    EstoyEnterado.tsx
    SeguimientoCoach.tsx

context/
  PerfilContext.tsx          ← emailOverride / teamEmail para rutas de API
  SemanaGlobalContext.tsx    ← Filtro de semana global (ver sección abajo)
  ModuloMetricContext.tsx    ← Métricas para chip en ModuloCard

lib/
  authOptions.ts             ← JWT callback con refresh de access token
  jerarquia.ts               ← Tipos PerfilUsuario, Persona, RolNormalizado
  roles.ts                   ← MODULOS_POR_ROL (qué módulos ve cada rol)
  semana.ts                  ← resolverSemana(param, semanas[])
  practicasLideres.ts        ← getPracticasLideres(token, perfil, semanaParam?)
  sheets.ts                  ← getSheetData helper
  db.ts                      ← SQLite para tokens
```

---

## Filtro Global de Semana (`SemanaGlobalContext`)

### Arquitectura (Opción A — ya implementada)

- **Un solo selector** por página reemplaza los dropdowns individuales de cada card.
- Cada módulo hace `reportWeeks(moduleId, semanas[])` tras su fetch → el contexto
  acumula la **unión de todas las semanas** reportadas.
- El selector muestra esa unión ordenada numéricamente; por defecto selecciona la
  última semana disponible.
- Al cambiar la semana global, cada módulo refetch con `?semana=X` → KPIs
  recalculados en el servidor.

### Normalización de semanas

- Las semanas pueden venir como `"W24"` (Quiz), `"24"` (numérico), o implícitas por
  cálculo de fecha ISO.
- `normalizarSemana(s)` en `SemanaGlobalContext.tsx`: strips non-digits → `"W24"` → `"24"`.
- `resolverSemana(param, semanas[])` en `lib/semana.ts`: normaliza `param` y busca
  match en el array; fallback a `semanas.at(-1)`.

### Estado de implementación

| Archivo | Estado |
|---------|--------|
| `context/SemanaGlobalContext.tsx` | ✅ Completo |
| `components/SemanaGlobalSelector.tsx` | ✅ Completo |
| `lib/semana.ts` | ✅ Completo |
| `components/modulos/Adherencia4DX.tsx` | ✅ usa useSemanaGlobal, reportWeeks, ?semana= |
| `components/modulos/AdherenciaPCA.tsx` | ✅ |
| `components/modulos/ConfirmacionesRol.tsx` | ✅ |
| `components/modulos/PracticasLideres.tsx` | ✅ |
| `components/modulos/QuizSemanal.tsx` | ✅ |
| `app/api/modulos/adherencia-4dx/route.ts` | ✅ semanaParam + resolverSemana |
| `app/api/modulos/adherencia-pca/route.ts` | ✅ |
| `app/api/modulos/confirmaciones-rol/route.ts` | ✅ |
| `app/api/modulos/practicas-lideres/route.ts` | ✅ |
| `app/api/modulos/quiz/route.ts` | ✅ |
| `app/page.tsx` | ✅ SemanaGlobalProvider + SemanaGlobalSelector |
| `components/AdminView.tsx` | ✅ SemanaGlobalProvider wrapping todo el return |
| `app/demo/real/page.tsx` | ✅ |
| **`app/demo/page.tsx`** | ⚠️ imports OK pero grid NO está envuelto en SemanaGlobalProvider |
| **`app/preview/page.tsx`** | ❌ sin imports ni Provider |
| **`components/CoachTeamView.tsx`** | ❌ sin SemanaGlobalProvider en el grid de cards |

---

## Bugs corregidos en esta sesión

| Bug | Causa | Fix |
|-----|-------|-----|
| Quiz "No Presentó" contaba como presentó | `s.includes("presentó")` hace match en "No Presentó" | Verificar `s.includes("no presento")` primero |
| PCA solo mostraba lunes | Columna "Fecha" vacía en hoja; agrupaba por fecha vacía | Agrupar por `${semana}-${diaCol}` usando "Dia Semana" |
| Confirmaciones "esta semana = 0" | Fechas en hoja como "2026-06-01 12:02" (ISO), `parseSheetDate` solo entendía `dd/mm/yyyy` | Regex ISO primero en `parseSheetDate` |
| Producción mostraba semanas viejas | Sin Cache-Control → Vercel edge cache | `export const dynamic = "force-dynamic"` + `revalidate = 0` + `Cache-Control: no-store` en 8 rutas |
| Adherencia 4DX 0% para coordinador | `perfil.supervisores` vacío al venir de debug; filtraba por array vacío | Filtrar por columna "Coordinador" en la hoja directamente |
| Resolutividad "sin datos" flicker | Error de quota de Sheets sobreescribía datos buenos | Flag `activo` + sólo `setData(d)` cuando `d.total` es número |
| TS error `perfil.emailCorporativo` | Propiedad es `perfil.persona.emailCorporativo` | Corregido path |
| Producción sin cambios visibles | Vercel cacheaba respuestas de API routes | Cache-Control: no-store en todas las rutas de módulos |

---

## Decisiones arquitectónicas

1. **Refetch por parámetro** (no filtrado en cliente) para el filtro de semana: los
   KPIs se recalculan en el servidor por semana, no se filtra el JSON ya recibido.

2. **`useRef` para `porModulo`** en `SemanaGlobalContext` para acumular semanas por
   módulo sin causar re-renders infinitos; sólo se bump `version` (estado) cuando el
   conjunto cambia.

3. **Resolutividad multi-jefatura**: el KPI global = promedio ponderado por #ideas;
   desglose por jefatura se muestra sólo cuando `porJefatura.length > 1`.

4. **Metas de Resolutividad dinámicas**: se leen de la hoja `Metas!A:B` (columna A =
   jefatura, columna B = meta%). Fallback 23% si no está en el mapa.

5. **Fechas PCA**: "Fecha" en "Detalle Eventos" está vacía. El día real viene de "Dia
   Semana" (1=Lun … 5=Vie). "Total Gestión Dia" es acumulado → se toma MAX por
   `(semana, dia)`.

6. **CoachTeamView filtros bidireccionales**: elegir coordinador → filtra servicios a
   los suyos; elegir servicio → filtra coordinadores a los que lo tienen.

---

## Archivos clave para cada módulo

| Módulo | Componente | Ruta API |
|--------|-----------|----------|
| Adherencia 4DX | `Adherencia4DX.tsx` | `api/modulos/adherencia-4dx` |
| Adherencia PCA | `AdherenciaPCA.tsx` | `api/modulos/adherencia-pca` |
| Confirmaciones Rol | `ConfirmacionesRol.tsx` | `api/modulos/confirmaciones-rol` |
| Prácticas Líderes | `PracticasLideres.tsx` | `api/modulos/practicas-lideres` |
| Quiz Semanal | `QuizSemanal.tsx` | `api/modulos/quiz` |
| Resolutividad | `Resolutividad.tsx` | `api/modulos/resolutividad` |

---

## Próximos pasos pendientes

1. **`app/demo/page.tsx`** — envolver el grid de `ModuloCard` con
   `<SemanaGlobalProvider>` y añadir `<SemanaGlobalSelector light />` encima.

2. **`app/preview/page.tsx`** — importar `SemanaGlobalProvider` + `SemanaGlobalSelector`,
   envolver grid + selector (igual que `demo/real/page.tsx`).

3. **`components/CoachTeamView.tsx`** — importar `SemanaGlobalProvider` +
   `SemanaGlobalSelector`, envolver el grid de MODULOS_EQUIPO con el Provider y
   añadir `<SemanaGlobalSelector />` (dark style) en la fila de filtros.

4. **`npx tsc --noEmit`** — verificar que no quedan errores de TypeScript.

5. **Commit + push** a master (requiere confirmación del usuario).

---

## Convenciones de fechas

- Hoja Sheets → `dd/mm/yyyy` (LATAM) → `parseSheetDate` produce `Date`
- Hoja Confirmaciones → `2026-06-01 12:02` (ISO con guiones) → mismo helper, regex ISO
- Semanas ISO → `resolverSemana` normaliza a número puro (strip non-digits)
- Comparaciones de semana: siempre normalizar con `normalizarSemana` antes de comparar

---

## Variables de entorno requeridas

```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
NEXTAUTH_SECRET
NEXTAUTH_URL
SPREADSHEET_ID          ← ID de la hoja maestra
```

---

## Notas de despliegue

- **Vercel**: todas las rutas de módulos tienen `export const dynamic = "force-dynamic"`
  + `revalidate = 0` + `Cache-Control: no-store` para evitar edge cache.
- **PCA route**: usa `private, max-age=120, stale-while-revalidate=60` porque la hoja
  tiene 17k filas — se admite cache breve del lado del cliente pero no edge cache público.
- Build TS: correr `npx tsc --noEmit` antes de cada push para detectar errores de tipo.
