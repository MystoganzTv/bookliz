# P0-B2 — Fusión por registro

> **IMPLEMENTADO el 2026-09-12.** Este documento se queda como el porqué; el
> código vive en `src/data/recordMerge.ts` (reglas puras),
> `src/data/booklizRepository.ts` (sellado, merge, push) y
> `supabase/migrations/20260912120000_per_record_merge.sql`.
>
> Tres cosas salieron distintas del diseño, y las tres por el mismo motivo —
> el diseño daba por hecho algo del servidor que no se sostiene:
>
> 1. **El sello lo pone el cliente, no el servidor.** El diseño decía comparar
>    contra el `updated_at` del servidor. No sirve: el push hace upsert de
>    *todas* las filas, así que el trigger reescribe ese campo en cada
>    sincronización y acaba diciendo "cuándo sincronizó este aparato", no
>    "cuándo cambió esta fila". La columna nueva `record_updated_at` la escribe
>    el dispositivo y ningún trigger la toca. El precio es comparar dos relojes
>    de dispositivo, que es la limitación inherente de último-en-escribir-gana;
>    se mitiga con sellos monótonos (`nextStamp`), para que un reloj atrasado no
>    deje al aparato incapaz de ganar nada nunca más.
>
> 2. **El sello se calcula al persistir, no en cada mutación.** El diseño pedía
>    escribirlo "en el momento en que la entidad cambia", y eso son decenas de
>    puntos en un contexto de 2.000 líneas, cada uno de ellos olvidable. En su
>    lugar `stampCollection` compara el snapshot nuevo con el anterior: una fila
>    que no cambió conserva su sello — que es justo la propiedad que
>    `snapshotFingerprint` necesitaba — y una que desapareció se convierte en
>    lápida sin que ningún reducer tenga que acordarse.
>
> 3. **Hizo falta un tercer estado: `revivedAt`.** No estaba en el diseño y sin
>    él la fusión no funciona. Un upsert normal no puede mandar
>    `deleted_at: null`, porque un aparato que estuvo desconectado borraría la
>    lápida que otro escribió y el libro resucitaría; y omitir la columna
>    siempre haría imposible deshacer un borrado. Un `deleted_at` solo se limpia
>    cuando el sello local dice que esa fila concreta volvió a la vida.

## El problema, en una frase

La resolución de conflictos es **a nivel de snapshot**: siempre gana un lado
entero y el otro se descarta. `resolveAgainstLocal` ya lo dice en su propio
comentario — *"Per-record merge is the only thing that avoids the drop
entirely, and it needs per-record timestamps the local snapshot does not carry
yet."*

Con un solo dispositivo da igual. Con dos, esto es lo que pasa: lees en el
iPad y registras una sesión; luego abres el iPhone, que tenía trabajo sin
subir; el iPhone gana y la sesión del iPad desaparece. Va a la copia de
seguridad de conflicto, así que es recuperable, pero es una ranura única y el
usuario tiene que darse cuenta y restaurarla a mano.

## Lo que ya existe y sirve

- Las siete tablas tienen `updated_at timestamptz` mantenido por el trigger
  `booklio_set_updated_at`, y las que se editan más tienen además `synced_at`.
  **El servidor ya tiene marca por fila.**
- El push es hijos primero, perfil al final y sellado con
  `snapshot_pushed_at`. Ese sello distingue un push completo de uno a medias, y
  hay que conservarlo tal cual.
- `CONFLICT_BACKUP_KEY` da la red de seguridad mientras se migra.

## Lo que falta y es el trabajo de verdad

### 1. `updatedAt` por registro en el snapshot local

Hoy el snapshot local lleva **un** `updatedAt` para todo. Cada libro, sesión,
reseña, autor y lista necesita el suyo, escrito en el momento en que esa
entidad cambia — no al persistir el snapshot, o todas tendrán la misma marca y
no habrá nada que comparar.

Ojo con `snapshotFingerprint()`: existe para que un persist sin cambios no
mueva `updatedAt`. Al añadir marcas por fila hay que mantener esa propiedad, o
cada arranque marcará la biblioteca entera como recién tocada y la fusión
elegirá siempre al último que abrió la app.

### 2. Tombstones — y esto es lo que hace que `pruneOrphans` tenga que morir

Hoy, borrar es *ausencia*: `pruneOrphans` lista los ids remotos y borra los que
no están en el snapshot local. Eso es correcto **solo** porque el snapshot que
sube es autoritativo y completo.

En cuanto se fusiona por registro, **la ausencia deja de significar "borrado" y
pasa a significar "no lo he visto"**. Un libro creado en el iPad y aún no
conocido por el iPhone sería eliminado por el iPhone en su siguiente push. Es
decir: `pruneOrphans` deja de ser una optimización y se convierte en un
destructor de datos.

Por tanto:

- Añadir `deleted_at timestamptz` a las cinco tablas hijas.
- Borrar es escribir `deleted_at`, nunca `DELETE`.
- **Quitar `pruneOrphans` por completo** en el mismo commit que introduce la
  fusión. No después. Si conviven un solo despliegue, se pierden datos.
- Filtrar los tombstones al cargar, y hacer limpieza de verdad solo por un job
  con una ventana amplia (90 días), nunca desde el cliente.

### 3. La regla de fusión

Por cada id presente en cualquiera de los dos lados:

| local | remoto | resultado |
|---|---|---|
| falta | existe | remoto |
| existe | falta | local (súbelo) |
| ambos | — | el de `updatedAt` mayor |
| cualquiera tiene `deleted_at` | — | gana el borrado **si** su marca es la más reciente |

Último-en-escribir-gana **por fila**, no por campo. La fusión por campo es
tentadora y no merece la pena aquí: obliga a marcas por campo y el caso real
—dos dispositivos editando el mismo libro en el mismo minuto— es raro, mientras
que el caso que duele —dispositivos distintos tocando libros distintos— lo
resuelve ya el nivel de fila.

**Los relojes mienten.** `updated_at` del servidor lo pone Postgres; el local
lo pone el dispositivo, y un iPhone con la hora mal puede ganar siempre o no
ganar nunca. Al fusionar, comparar contra el `updated_at` del servidor cuando
exista, y usar el local solo para filas que el servidor nunca ha visto.

### 4. Orden de implementación

1. Marcas por registro en local, escritas pero **sin usar**. Un despliegue.
2. `deleted_at` + borrado lógico, todavía con `pruneOrphans` vivo.
3. La fusión, y `pruneOrphans` fuera, en el mismo commit.

Los pasos 1 y 2 son compatibles hacia atrás; el 3 no lo es. Una build antigua
que hable con el esquema nuevo seguirá borrando por ausencia.

## Pruebas que hay que escribir antes del paso 3

`repositorySupabaseSync.test.ts` ya usa un cliente falso en memoria: sirve de
base. Los casos que importan son los que hoy pierden datos:

- Dos dispositivos, libros distintos, ninguno se pierde.
- Dos dispositivos, el mismo libro: gana el de marca mayor, el otro no
  reaparece en el siguiente ciclo.
- Borrado en A, edición en B: si el borrado es posterior, el libro se queda
  borrado y **no resucita** en el push de B. Este es el que falla en todos los
  sistemas de sync que se escriben sin tombstones.
- Un push a medias (perfil sin sellar) no se toma como "la nube está vacía".
  Ya está cubierto; que siga estándolo después de la fusión.
