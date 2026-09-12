# Capturas para la App Store — guion

Estado: **0 de 10 subidas.** Es lo único que bloquea el envío de la 1.1.0.

## El tamaño, antes que nada

App Store Connect pide la ranura **iPhone 6,5"** y acepta exactamente:
`1242 × 2688` o `1284 × 2778` (y sus horizontales).

Eso descarta el iPhone 15/16 Pro Max, que da `1290 × 2796` y **te lo va a
rechazar al subirlo**. Usa uno de estos simuladores:

- **iPhone 14 Plus** → 1284 × 2778 ✅
- iPhone 13 Pro Max → 1284 × 2778 ✅
- iPhone 11 Pro Max → 1242 × 2688 ✅

```bash
xcrun simctl list devices available | grep -i "14 Plus\|13 Pro Max"
npx expo run:ios --device "iPhone 14 Plus"
```

Capturar: con el simulador enfocado, **⌘S** guarda el PNG en el Escritorio al
tamaño correcto. No recortes ni redimensiones después.

## Antes de disparar

1. **Empieza limpio**: Ajustes → *Vaciar biblioteca*, y si hace falta pasa el
   onboarding otra vez. Las capturas con datos de demo se notan.
2. **Puebla la biblioteca con 8–12 libros de verdad**, mezclando español e
   inglés — la paridad bilingüe es un argumento de venta y se ve en la
   portada de cada libro. Sugerencia: *Alas de sangre*, *Cien años de
   soledad*, *El nombre del viento*, *Dune*, *Fourth Wing*, *Proyecto Hail
   Mary*, más dos o tres tuyos.
3. **Deja rastro de uso**: 2 o 3 libros en curso con progreso distinto (18 %,
   64 %, 91 %), unas cuantas sesiones de lectura repartidas en la semana y un
   par de libros terminados. Una app de seguimiento con las estadísticas a
   cero no vende nada.
4. Modo claro para todas. Mezclar claro y oscuro en la misma tira se ve
   descuidado; si quieres enseñar el oscuro, que sea la última.
5. Barra de estado: el simulador ya la pone limpia. Comprueba que no salga
   ningún banner de depuración.

## Las capturas, en orden

Las **tres primeras** son las que Apple enseña en la hoja de instalación y en
resultados de búsqueda. Son las que importan.

| # | Pantalla | Qué tiene que verse |
|---|---|---|
| 1 | **Biblioteca**, vista de lista | Llena, con portadas reales y barras de progreso. Es la promesa entera de la app en una imagen. |
| 2 | **Escáner / Añadir libro** | La cámara apuntando a una contraportada, o la tarjeta de confirmación ya resuelta con portada, páginas y sinopsis. Vende la magia: escaneas y aparece todo. |
| 3 | **Detalle de un libro** | Uno en curso, con progreso, saga y valoración. Elige uno en español para que se vea que la portada y la sinopsis se quedan en español. |
| 4 | **Sesión de lectura** | El formulario con páginas, minutos y dónde estabas. Es lo que te separa de una lista de deseos cualquiera. |
| 5 | **Estadísticas** | Racha, objetivo anual, el retrato de lector. Aquí es donde los datos poblados pagan. |
| 6 | **Sagas** | Un libro de una serie con la cuenta de por dónde vas. |
| 7 | *(opcional)* **Citas y reseñas** | Una cita guardada junto a su libro. |
| 8 | *(opcional)* **Modo oscuro** | La biblioteca otra vez, en oscuro. |

Con 6 vas sobrado; 8 si las opcionales quedan bien. Diez mediocres son peores
que seis buenas.

## Cuando las tengas

Déjalas numeradas (`01-biblioteca.png`, `02-escaner.png`, …) en una carpeta y
dímelo: las subo yo a App Store Connect en ese orden.

## Lo que queda después

1. Capturas subidas (esto).
2. `npm run ship` desde tu Mac — verify, pre-flight, build de EAS y envío.
   Requiere tu cuenta de Apple, así que lo lanzas tú.
3. Con la build arriba: adjuntarla a la 1.1.0 y *Add for Review*.
