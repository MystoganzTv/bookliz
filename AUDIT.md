# Bookliz — Auditoría técnica

**Fecha:** 2026-07-28
**Commit base:** `3bc4039` (Same-book validation + grouped edition picker)
**Baseline verificado:** `tsc --noEmit` limpio · `jest` 342/342 verdes · 16 suites
**Tras los fixes:** `tsc` limpio · `jest` 365/365 · 18 suites · i18n 717=717 EN/ES

> **Estado:** todos los P0 y P1 cerrados salvo P0-1 (requiere credenciales de Google) y
> la mitad de P0-3 (decisión de estrategia de versionado). Ver "Registro de cierre" al final.

## Resumen

El código está sano donde has puesto foco: la pipeline de metadata (política de idioma estricta, evidencia, validación de ediciones) tiene 342 tests que la fijan, i18n está al 100% (690 claves EN = 690 ES, 0 claves usadas sin definir), RLS activo en las 6 tablas de Supabase, `.env` fuera de git, casi cero `any`.

Los problemas están **fuera** de esa zona: configuración nativa con placeholders, limpieza de estado incompleta, resiliencia de red, y rendimiento de listas. Nada de eso está cubierto por tests, que es exactamente por qué sobrevivió.

| Severidad | Nº | Qué significa |
|---|---|---|
| P0 | 4 | Bloquea lanzamiento o viola un mandato de producto |
| P1 | 8 | Bug real con impacto en usuario |
| P2 | 10 | Deuda técnica |

---

## P0 — Bloqueantes

### P0-1 · Google Sign-In en iOS no funciona (placeholders sin rellenar)

`app.json:50,57`

```json
"iosUrlScheme": "com.googleusercontent.apps.TU_REVERSED_IOS_CLIENT_ID"
"iosClientId": "TU_IOS_CLIENT_ID.apps.googleusercontent.com"
```

`GoogleConnectionCard.tsx:151` detecta el placeholder y muestra al usuario final un mensaje de instrucciones para desarrollador:

> "Add your iOS Client ID from Google Cloud Console to app.json → extra → googleAuth → iosClientId, then rebuild."

Además `ios/Booklio/Info.plist` registra el esquema URL derivado del **webClientId** (`...167166673441-1m9fio2dlddt0a053ip2o8b6tan85pdb`), no de un cliente OAuth de iOS. Google Sign-In en iOS exige un cliente OAuth tipo iOS propio.

**Fix:** crear el cliente OAuth iOS en Google Cloud Console, poner el ID real en `app.json` → `extra.googleAuth.iosClientId` y el reversed en el plugin, `npx expo prebuild --clean` o editar el plist a mano, rebuild.

**Acción tuya.** No puedo generar credenciales.

---

### P0-2 · Metadata demo se inyecta en libros reales

`src/data/BooklizContext.tsx:176-195`

```ts
const mergeSeedBookMetadata = (books: Book[]) =>
  books.map((book) => {
    const seedMatch = bookSeed.find((seed) => seed.id === book.id || (seed.isbn && seed.isbn === book.isbn));
    if (!seedMatch) return normalizeReadState(book);
    return normalizeReadState({
      ...seedMatch,      // ← TODOS los campos del demo entran primero
      ...book,
      synopsis: book.synopsis || seedMatch.synopsis,
      publisher: book.publisher || seedMatch.publisher,
      ...
    });
  });
```

Se ejecuta en cada hidratación (`:768`) sobre **la biblioteca real del usuario**. Si un libro añadido por el usuario comparte ISBN con uno de los 13 de `mockData.ts`, hereda su sinopsis, editorial, portada, gradiente, páginas, fecha de publicación, serie y género — todo contenido escrito a mano para la demo.

Esto contradice frontalmente el mandato que fijaste en `metadataMergePolicy.ts`: cero metadata fabricada visible, nunca sobrescribir lo del usuario, idioma bloqueado. `mergeSeedBookMetadata` no pasa por esa política.

**Fix:** eliminar la función y el merge. Los seeds son datos de demo; no tienen autoridad sobre la biblioteca real.

---

### P0-3 · Versión desalineada — publicarías 1.0.0

| Fuente | Versión |
|---|---|
| `app.json` | `1.1.0` |
| `ios/Booklio/Info.plist` → `CFBundleShortVersionString` | `1.0.0` |
| `releaseNotes.ts` | entradas para 1.1.0 y 1.0.0 |
| `WhatsNewModal.tsx:19` | lee `Constants.expoConfig?.version` → `1.1.0` |

Estás en bare workflow con `ios/` commiteado (23 ficheros trackeados), así que `app.json` **no** propaga al build nativo. Se sube 1.0.0 a App Store Connect mientras la app enseña las notas de la 1.1.0.

**Fix:** alinear `CFBundleShortVersionString` a `1.1.0` (o `expo prebuild`), y decidir una única fuente de verdad. Sugerencia: leer siempre de `expo-application` (`nativeApplicationVersion`) en runtime en vez de `expoConfig.version`, así el modal nunca puede desincronizarse del binario.

---

### P0-4 · Logging temporal marcado "remove before production"

`src/data/BooklizContext.tsx:711,717`

```ts
// TEMP DEBUG — [IDENTITY_TRIGGER]: remove before production.
```

Tú mismo lo marcaste. Sigue ahí.

---

## P1 — Bugs reales

### P1-1 · No hay ErrorBoundary

`App.tsx` monta 6 providers y el navigator sin ninguna barrera. Cualquier excepción en render (una portada con formato raro, un `undefined` en un `.map`, un fallo de parseo en un provider externo) tumba el árbol entero: pantalla en blanco, sin recuperación, sin señal de qué pasó.

Es la diferencia entre "una pantalla falló" y "la app está rota". En una app cuya lógica principal consume APIs externas con formas de datos que no controlas, esto es la red de seguridad que más rinde por línea escrita.

---

### P1-2 · `resetApp()` deja el perfil de gusto del usuario anterior

`src/data/BooklizContext.tsx:1455-1460` borra 4 claves:

```
bookliz:v2 · @bookliz/onboardingComplete · bookliz_connected_account · bookliz_google_account
```

Sobreviven al reset:

| Clave | Qué contiene | Consecuencia |
|---|---|---|
| `@bookliz/reading-identity/v1` | TasteVector: géneros, autores, ritmo, hábitos | **El usuario nuevo recibe recomendaciones basadas en el gusto del anterior** |
| `@bookliz/cache/v2/*` | Cache de Discover (trending, personalizadas, 12–24 h) | Secciones del usuario anterior |
| `@bookliz/notificationPrefs` | Hora del recordatorio diario | Notificaciones heredadas |
| `@bookliz/offlineQueue` | Operaciones pendientes de sync | Se suben a la cuenta equivocada |
| `@bookliz/whatsNewLastVersion` | | Modal no reaparece |
| `@bookliz/theme`, `@bookliz/locale` | | Menor — discutible si deben sobrevivir |

La cola offline es la peor: operaciones encoladas del usuario A se reproducen tras el reset y el sign-in de B.

---

### P1-3 · Storage key inconsistente: `booklio:v2` vs `bookliz:v2`

```
src/data/booklizRepository.ts:37   const STORAGE_KEY = "booklio:v2";   ← el que se lee/escribe de verdad
src/data/BooklizContext.tsx:1456   multiRemove(["bookliz:v2", ...])    ← borra una clave que no existe
src/data/BooklizContext.tsx:1479   setItem("bookliz:v2", ...)          ← escribe a una clave que nadie lee
```

`clearLibrary()` escribe su snapshot vacío a `bookliz:v2`; el repositorio lee `booklio:v2`. Que funcione es accidental: al hacer `setHydrated(true)` con el estado ya vacío, el efecto de persistencia (`:909`) guarda por la ruta correcta.

Efectos: basura huérfana permanente en `bookliz:v2`, `resetApp` no borra el snapshot real (depende del mismo accidente), y la próxima persona que toque este código asumirá que la clave del contexto es la buena.

---

### P1-4 · 15 `fetch()` sin timeout ni cancelación

`googleBooksProvider.ts` (5) · `bookLookupService.ts` (5) · `openLibraryProvider.ts` (5) — cero `AbortController` en todo el repo.

Los `Promise.race` de `metadataResolver.ts:60` y `identityRecommendations.ts:217` resuelven la promesa a los 8 s pero **no abortan la petición**: la conexión sigue viva consumiendo socket y batería.

Y las rutas que no pasan por esos race (GenreBrowse, AuthorBooks, Discover, búsqueda directa) no tienen timeout ninguno. En una red móvil que acepta la conexión pero no responde, el spinner gira indefinidamente.

Tampoco hay backoff para los 429 de Google Books que ya has visto en los logs — cada reintento del usuario suma cuota.

**Fix:** un wrapper `fetchWithTimeout(url, ms)` con `AbortController` y aplicarlo en los tres providers.

---

### P1-5 · La biblioteca entera se renderiza sin virtualizar

`LibraryScreen.tsx:342,355` — `filteredBooks.map(...)` dentro de `<Screen>`, que por defecto envuelve en `ScrollView` (`Screen.tsx:29`).

Cada libro monta su tarjeta y su `<Image>` de portada a la vez, filtrado o no. Con 50 va bien; con 500 son 500 imágenes en memoria y el scroll se va al suelo en dispositivos de gama media. `GenreBrowse` y `AuthorBooks` sí usan `FlatList` — la pantalla que más crece con el uso es la que no.

**Fix:** `FlatList` con `numColumns={2}` para grid, `windowSize`/`removeClippedSubviews`. Requiere sacar el header y los raíles a `ListHeaderComponent`.

---

### P1-6 · Persistencia sin debounce: toda la biblioteca en cada cambio

`BooklizContext.tsx:909-930` — el efecto depende de `[authors, books, readingSessions, reviews, resolvedProfile]` y en cada disparo:

1. serializa **toda** la biblioteca a JSON y la escribe en AsyncStorage;
2. `repository.save()` hace upsert de **todos** los arrays completos a las 6 tablas de Supabase (`booklizRepository.ts:274-306`) y luego un `delete` de huérfanos (`:357`).

Marcar una página leída sube la biblioteca entera. Con 500 libros son cientos de KB por interacción, contra la cuota de Supabase y la batería del usuario.

**Fix:** debounce de ~1–2 s en el efecto local, y sync remoto por diff (o al menos con su propio debounce más largo / al pasar a background).

---

### P1-7 · Accesibilidad: 1 prop en 211 elementos táctiles

211 `Pressable`/`TouchableOpacity` en el árbol. `accessibilityLabel` o `accessibilityRole`: **1**, en `SettingsScreen`.

Con VoiceOver la app es prácticamente inoperable: los botones se anuncian sin nombre o no se anuncian. La mayoría son botones de solo icono (`···`, timer, favorito, menú), que es justo el caso donde la etiqueta es obligatoria porque no hay texto del que inferir.

No bloquea la revisión de App Store, pero es la clase de gap que se arregla barato ahora y caro después de 200 pantallas más.

---

### P1-8 · `userInterfaceStyle: "light"` con tema oscuro implementado

`app.json:9`. La app tiene tema claro/oscuro completo (`ThemeContext`) pero fuerza traits nativos claros en iOS. Resultado en modo oscuro: teclado, menús contextuales, action sheets y selectores nativos aparecen en claro sobre una UI oscura.

Nota aparte: `ThemeContext` nunca consulta `useColorScheme()`, así que la app tampoco respeta la preferencia del sistema en el primer arranque — siempre empieza en claro. Es una decisión legítima, pero conviene que sea deliberada.

**Fix:** `"userInterfaceStyle": "automatic"`.

---

## P2 — Deuda

| # | Qué | Dónde |
|---|---|---|
| P2-1 | 7 ficheros huérfanos, ~1.700 líneas: `BookEditionsSheet` (610), `MoodBooksSheet`, `CuratedListSheet`, `HeroRecommendationCard`, `StatCard`, `deepLink.ts`, `expo-auth-modules.d.ts` | `src/components/`, `src/utils/` |
| P2-2 | **Dos** `recommendationEngine.ts` distintos (357 y 370 líneas), ambos vivos: `utils/` lo usa el contexto, `services/` lo usan 6 pantallas | `src/utils/`, `src/services/` |
| P2-3 | `Stats` no está en `RootStackParamList` → 3 `as any` para navegar y registrar la pantalla | `navigation/types.ts`, `AppNavigator.tsx:171`, `ProfileScreen.tsx:203` |
| P2-4 | `mockData.ts` (725 líneas de libros demo) viaja en el bundle de producción y es el estado inicial de `useState` | `src/data/mockData.ts` |
| P2-5 | `EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY` va en el bundle JS — extraíble. Inevitable en cliente, pero exige restricción por app/bundle ID y tope de cuota en Google Cloud | `googleBooksProvider.ts:20` |
| P2-6 | Falta `ITSAppUsesNonExemptEncryption` → App Store Connect pregunta export compliance en cada subida | `ios/Booklio/Info.plist` |
| P2-7 | Cero tests de componente o pantalla. Los 342 cubren lógica pura; ninguno monta un árbol React | `src/__tests__/` |
| P2-8 | Jest avisa: *"A worker process has failed to exit gracefully"* — handles/timers abiertos sin limpiar en algún test | suite |
| P2-9 | README desactualizado: dice que las tabs son "Home, Library, Add, Stats, Profile" (son Home, Library, Add, Discover, Profile) y describe la app como "mock data con 13 libros" | `README.md` |
| P2-10 | Carpeta nativa aún llamada `ios/Booklio/`, `Booklio.xcodeproj`, `Booklio.xcworkspace`; tablas Supabase con prefijo `booklio_` | nativo + `supabase/` |

---

## Lo que está bien

Vale la pena registrarlo, porque marca dónde **no** hace falta gastar esfuerzo:

- **Pipeline de metadata**: 342 tests verdes fijando la política de idioma estricta, la evidencia de idioma, el switch de edición y la validación mismo-libro. `tsc` limpio.
- **i18n**: 690 claves EN, 690 ES, paridad exacta, 0 claves usadas sin definir. Verificado con extracción automática.
- **Seguridad de datos**: RLS activo en las 6 tablas con políticas select/insert/update/delete por `user_id`. `.env` fuera de git. `dist/` no trackeado.
- **Tipado**: 8 `any` en ~39.000 líneas, casi todos por el gap de `Stats` en el ParamList. Un solo `!` non-null en todo el repo.
- **Arquitectura offline-first**: cola offline con reintentos, expiración a 7 días y flush al volver a foreground.
- **Honestidad de datos**: `metadataMergePolicy` con logs de rechazo trazables. El único agujero es `mergeSeedBookMetadata` (P0-2), que se salta esa política.

---

## Registro de cierre

### Cerrados

| Id | Qué se hizo |
|---|---|
| P0-A *(rev. 2026-08-10)* | `load()` tenía las tres rutas en un solo `try`: si fallaba Supabase, el snapshot local no se leía nunca y devolvía `null`, que el provider interpretaba como instalación nueva → seeds → sobrescritura de la biblioteca real a los 600 ms. Ahora cada ruta tiene su `try`, el fallback local se ejecuta siempre, y `RepositoryStatus.localReadFailed` distingue "no hay nada" de "no pude leer". Si falla la lectura local, `persistBlockedRef` bloquea toda escritura. 6 tests nuevos |
| P1-A *(rev. 2026-08-10)* | `expo install --fix`: `expo-haptics` 56.0.3 → 15.0.8 (era un salto de major a un SDK futuro, colado por `legacy-peer-deps`), `jest-expo` → 54.0.17, `expo` → ~54.0.36. Sin cambios de código: el wrapper solo usa APIs estables |
| P0-B *(rev. 2026-08-10)* | La nube ganaba siempre y las ediciones offline se perdían al reabrir. Resolución por marcador de sincronización (`LOCAL_SYNC_MARKER_KEY`), no por comparación de fechas: los dos valores los escribe el mismo reloj. El snapshot perdedor se aparca en `CONFLICT_BACKUP_KEY`. 10 tests nuevos. Queda abierto P0-B2 (fusión por registro para multi-dispositivo) |
| P0-2 | `mergeSeedBookMetadata` eliminada → `hydrateBooks`. Los seeds ya no tienen autoridad sobre la biblioteca real |
| P0-4 | Logging `[IDENTITY_TRIGGER]` borrado |
| P1-1 | `src/components/ErrorBoundary.tsx` nuevo, envuelve el árbol en `App.tsx`. Sin tema ni i18n a propósito: si un provider es lo que crashea, el fallback no puede depender de él |
| P1-2 | `resetApp` limpia identity + cola offline + prefs de notificaciones + whatsNew + cache de Discover. Tema e idioma se conservan (son preferencias de dispositivo, no de cuenta) |
| P1-3 | `LOCAL_SNAPSHOT_KEY` exportada desde el repositorio y usada en todas partes. Sigue siendo `"booklio:v2"`: renombrarla huerfanaría la biblioteca de cada instalación existente |
| P1-4 | `src/utils/fetchWithTimeout.ts` con `AbortController` + cortacircuitos de 429. Los 15 `fetch` migrados. 15 tests |
| P1-5 | `LibraryScreen` virtualizada con `FlatList` (`numColumns` 3 en grid, header y raíles en `ListHeaderComponent`) |
| P1-6 | Persistencia en dos cadencias: local 600 ms, nube 10 s trailing, flush forzado al pasar a segundo plano. `save({ localOnly })` en el repositorio. 8 tests |
| P1-7 | 206/206 elementos táctiles con `accessibilityRole`; 29 etiquetas i18n nuevas (`a11y.*`) en los que solo muestran icono |
| P1-8 | `userInterfaceStyle` → `automatic` |
| P0-3 | *Parcial* — Info.plist a 1.1.0 y `ITSAppUsesNonExemptEncryption` añadido. Falta decidir la fuente única de verdad |
| P2-1 | 6 huérfanos borrados (~1.700 líneas) |
| P2-3 | `Stats` en `RootStackParamList`, fuera los `as any` |
| P2-6 | `ITSAppUsesNonExemptEncryption=false` |
| P2-9 | README reescrito |

Hallazgo extra durante el trabajo: `collectorShelves` en `LibraryScreen` calculaba cuatro
agregados sobre toda la biblioteca en cada render para una sección que nunca se renderizaba.
Eliminado junto con sus cuatro `books.filter`.

### Abiertos

| Id | Qué falta | Quién |
|---|---|---|
| P0-B2 *(rev. 2026-08-10)* | Fusión por registro. Con dos dispositivos editando antes de sincronizar, la resolución por snapshot descarta un lado entero (queda en `CONFLICT_BACKUP_KEY`, recuperable pero no aplicado). Requiere `updatedAt` por registro en el snapshot local + tombstones para borrados + migración a v3 | Siguiente sesión |
| P0-1 | Google Sign-In iOS: crear el cliente OAuth de iOS en Google Cloud Console y sustituir `TU_IOS_CLIENT_ID` / `TU_REVERSED_IOS_CLIENT_ID` | **Tú** — no puedo generar credenciales |
| P0-3 | Elegir fuente única de versión. Sugerencia: `expo-application` → `nativeApplicationVersion` en runtime, para que `WhatsNewModal` no pueda desincronizarse del binario | **Tú** |
| P2-2 | Unificar los dos `recommendationEngine.ts` | Siguiente sesión |
| P2-4 | Sacar `mockData.ts` del bundle de producción | Siguiente sesión |
| P2-5 *(rev. 2026-09-12)* | **La premisa ya no vale.** Restringir por bundle ID rompería la clave: desde que existe el proxy, quien llama a Google no es la app sino dos Edge Functions, que no son una app iOS ni tienen IP fija que fijar. Comprobado en la consola: la clave ya está restringida a **Books API + Cloud Vision API**, que es la restricción que sí aplica aquí, y la app no la lleva dentro. Queda el tope de cuota por API | **Tú** |
| P2-11 *(2026-09-12)* | **Vision devuelve 403 en producción**: `This API method requires billing to be enabled` en el proyecto `booklio-497503`. El OCR de portadas no identifica nada, aunque la función esté desplegada y la app la llame. Books sí responde (probado, 200) porque no exige facturación. Hasta que el billing esté activo, *Hacer foto* solo guarda la imagen como portada | **Tú** — activar billing |
| P2-7 | Tests de componente/pantalla — sigue habiendo cero | Continuo |
| P2-8 | Handle abierto en la suite (aviso de Jest) | Bajo |
| P2-10 | Renombrar `ios/Booklio/` y el prefijo `booklio_` de Supabase | Requiere migración |

### Notas de implementación

**Por qué el cortacircuitos de 429.** La pipeline de metadata lanza 6+ jobs en paralelo por
búsqueda. Con la cuota de Google Books agotada eso son 6 peticiones condenadas por búsqueda, y
cada una sigue contando. Tras un 429 dejamos de llamar a ese host durante 60 s y fallamos rápido
en local. Los callers ya tratan el fallo como "sin resultados", así que la UI degrada igual —
solo que al instante y gratis.

**Por qué la persistencia va en dos niveles.** La escritura local es barata y debe ocurrir casi
en cada cambio para no perder trabajo. La remota es un upsert de seis tablas. Mezclarlas
significaba que marcar una página leída subía la colección entera. Ahora la remota es trailing y
se fuerza al salir del foreground, que es el último momento fiable antes de que el sistema
pueda suspendernos.

**Por qué `key={viewMode}` en la FlatList.** `numColumns` no se puede cambiar en una lista ya
montada; remontar es la vía soportada para alternar entre cuadrícula y filas.
