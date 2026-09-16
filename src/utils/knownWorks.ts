/**
 * Known Works Catalog
 *
 * A curated offline database of:
 *   - Popular book series with canonical metadata
 *   - Translation mappings (translated title → original work)
 *   - ISBN aliases for editions not well-indexed by APIs
 *
 * This is the fallback source of truth when Google Books and Open Library
 * return incomplete or zero results.
 *
 * WORK MODEL:
 *   WORK → SERIES → EDITIONS → FORMATS
 *
 * Coverage priority:
 *   1. Popular fantasy / romance / thriller series (top sellers)
 *   2. Spanish translations of English originals (primary user demographic)
 *   3. Classic literature with many editions
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KnownBook {
  /** Series position (1-based). Use 0 for standalones. */
  order: number;
  /** All known titles for this book across languages */
  titles: string[];
  /** Known ISBN-13s across all editions */
  isbns?: string[];
  /** Year first published */
  year?: number;
}

export interface KnownSeries {
  /** Canonical English series name */
  name: string;
  /** All known name variants / translations */
  aliases: string[];
  /** Primary author (canonical spelling) */
  author: string;
  /** Author name variants (maiden names, transliterations, common misspellings) */
  authorAliases: string[];
  books: KnownBook[];
}

export interface KnownWorkMetadata {
  /** Canonical English title */
  originalTitle: string;
  /** Localized / translated title (the key used to look this up) */
  translatedTitle: string;
  author: string;
  seriesName?: string;
  seriesOrder?: number;
  year?: number;
  genres?: string[];
  /** ISO 639-1 language code of the translation */
  languageCode?: string;
}

// ─── Series Catalog ───────────────────────────────────────────────────────────

export const KNOWN_SERIES: KnownSeries[] = [
  // ── Rebecca Yarros — The Empyrean ──────────────────────────────────────────
  {
    name: "The Empyrean",
    aliases: ["empyrean", "empíreo", "el empíreo"],
    author: "Rebecca Yarros",
    authorAliases: ["yarros", "rebecca yarros", "rebeca yarros"],
    books: [
      {
        order: 1,
        titles: ["Fourth Wing", "Alas de sangre", "Cuarta Ala", "Fourth Wing: Alas de sangre"],
        isbns: [
          "9781649374042", // EN Hardcover
          "9781649374073", // EN Paperback
          "9786073925020", // ES Special Edition (Planeta MX)
          "9788408281153", // ES Planeta España
          "9786073925013", // ES Planeta MX standard
          "9781649374080", // EN Ebook
        ],
        year: 2023,
      },
      {
        order: 2,
        titles: ["Iron Flame", "Alas de hierro", "Llama de hierro"],
        isbns: [
          "9781649374172", // EN Hardcover
          "9786073929196", // ES Planeta MX
          "9788408283850", // ES Planeta España
        ],
        year: 2023,
      },
      {
        order: 3,
        titles: ["Onyx Storm", "Alas de ónix", "Tormenta de ónix", "Tormenta Onyx"],
        isbns: [
          "9781649374257", // EN Hardcover
          "9786073934756", // ES Planeta MX
        ],
        year: 2025,
      },
    ],
  },

  // ── Brandon Sanderson — The Stormlight Archive ─────────────────────────────
  {
    name: "The Stormlight Archive",
    aliases: ["stormlight", "stormlight archive", "archivo de las tormentas"],
    author: "Brandon Sanderson",
    authorAliases: ["sanderson", "brandon sanderson"],
    books: [
      {
        order: 1,
        titles: ["The Way of Kings", "El camino de los reyes", "Way of Kings"],
        isbns: ["9780765326355", "9780765365279"],
        year: 2010,
      },
      {
        order: 2,
        titles: ["Words of Radiance", "Palabras de resplandor"],
        isbns: ["9780765326362", "9780765374011"],
        year: 2014,
      },
      {
        order: 3,
        titles: ["Oathbringer", "Juramentada"],
        isbns: ["9780765326379", "9780765392060"],
        year: 2017,
      },
      {
        order: 4,
        titles: ["Rhythm of War", "El ritmo de la guerra"],
        isbns: ["9780765326386", "9781250843951"],
        year: 2020,
      },
      {
        order: 5,
        titles: ["Wind and Truth", "Viento y verdad"],
        isbns: ["9780765326393"],
        year: 2024,
      },
    ],
  },

  // ── Brandon Sanderson — Mistborn ───────────────────────────────────────────
  {
    name: "Mistborn",
    aliases: ["mistborn", "nacidos de la bruma"],
    author: "Brandon Sanderson",
    authorAliases: ["sanderson", "brandon sanderson"],
    books: [
      {
        order: 1,
        titles: ["The Final Empire", "Mistborn: The Final Empire", "El Imperio Final", "Nacidos de la bruma"],
        isbns: ["9780765311788", "9780765377135"],
        year: 2006,
      },
      {
        order: 2,
        titles: ["The Well of Ascension", "El pozo de la ascensión"],
        isbns: ["9780765316882", "9780765377142"],
        year: 2007,
      },
      {
        order: 3,
        titles: ["The Hero of Ages", "El héroe de las eras"],
        isbns: ["9780765316899", "9780765377159"],
        year: 2008,
      },
    ],
  },

  // ── George R.R. Martin — A Song of Ice and Fire ───────────────────────────
  {
    name: "A Song of Ice and Fire",
    aliases: ["song of ice and fire", "game of thrones", "canción de hielo y fuego", "cancion de hielo y fuego"],
    author: "George R.R. Martin",
    authorAliases: ["martin", "george martin", "grrm", "george r martin", "george rr martin"],
    books: [
      {
        order: 1,
        titles: ["A Game of Thrones", "Juego de tronos", "Game of Thrones"],
        isbns: ["9780553593716", "9780553386790", "9788496208964"],
        year: 1996,
      },
      {
        order: 2,
        titles: ["A Clash of Kings", "Choque de reyes"],
        isbns: ["9780553593723", "9780553381696", "9788496208971"],
        year: 1999,
      },
      {
        order: 3,
        titles: ["A Storm of Swords", "Tormenta de espadas"],
        isbns: ["9780553593730", "9780553106633", "9788496208988"],
        year: 2000,
      },
      {
        order: 4,
        titles: ["A Feast for Crows", "Festín de cuervos"],
        isbns: ["9780553582024", "9780553801507"],
        year: 2005,
      },
      {
        order: 5,
        titles: ["A Dance with Dragons", "Danza de dragones"],
        isbns: ["9780553582017", "9780553801477"],
        year: 2011,
      },
    ],
  },

  // ── J.K. Rowling — Harry Potter ───────────────────────────────────────────
  {
    name: "Harry Potter",
    aliases: ["harry potter", "harry potter series"],
    author: "J.K. Rowling",
    authorAliases: ["rowling", "jk rowling", "j k rowling", "j.k. rowling"],
    books: [
      {
        order: 1,
        titles: ["Harry Potter and the Sorcerer's Stone", "Harry Potter and the Philosopher's Stone", "Harry Potter y la piedra filosofal", "Harry Potter a l'école des sorciers"],
        isbns: ["9780439708180", "9780590353427", "9788478884452", "9788478886944"],
        year: 1997,
      },
      {
        order: 2,
        titles: ["Harry Potter and the Chamber of Secrets", "Harry Potter y la cámara secreta"],
        isbns: ["9780439064873", "9780439064866", "9788478884629"],
        year: 1998,
      },
      {
        order: 3,
        titles: ["Harry Potter and the Prisoner of Azkaban", "Harry Potter y el prisionero de Azkabán"],
        isbns: ["9780439136358", "9780439136365", "9788478885190"],
        year: 1999,
      },
      {
        order: 4,
        titles: ["Harry Potter and the Goblet of Fire", "Harry Potter y el cáliz de fuego"],
        isbns: ["9780439139595", "9780439139601", "9788478885435"],
        year: 2000,
      },
      {
        order: 5,
        titles: ["Harry Potter and the Order of the Phoenix", "Harry Potter y la Orden del Fénix"],
        isbns: ["9780439358064", "9780439358071"],
        year: 2003,
      },
      {
        order: 6,
        titles: ["Harry Potter and the Half-Blood Prince", "Harry Potter y el misterio del príncipe"],
        isbns: ["9780439784542", "9780439784559"],
        year: 2005,
      },
      {
        order: 7,
        titles: ["Harry Potter and the Deathly Hallows", "Harry Potter y las reliquias de la muerte"],
        isbns: ["9780545010221", "9780545010238"],
        year: 2007,
      },
    ],
  },

  // ── Suzanne Collins — The Hunger Games ────────────────────────────────────
  {
    name: "The Hunger Games",
    aliases: ["hunger games", "los juegos del hambre", "juegos del hambre"],
    author: "Suzanne Collins",
    authorAliases: ["collins", "suzanne collins"],
    books: [
      {
        order: 1,
        titles: ["The Hunger Games", "Los juegos del hambre"],
        isbns: ["9780439023481", "9788427200449"],
        year: 2008,
      },
      {
        order: 2,
        titles: ["Catching Fire", "En llamas"],
        isbns: ["9780439023498", "9780439023504"],
        year: 2009,
      },
      {
        order: 3,
        titles: ["Mockingjay", "Sinsajo"],
        isbns: ["9780439023511", "9780439023528"],
        year: 2010,
      },
      {
        order: 0,
        titles: ["The Ballad of Songbirds and Snakes", "La balada de pájaros cantores y serpientes"],
        isbns: ["9780439185011", "9780702309038"],
        year: 2020,
      },
    ],
  },

  // ── Sarah J. Maas — A Court of Thorns and Roses ───────────────────────────
  {
    name: "A Court of Thorns and Roses",
    aliases: ["actar", "acotar", "a court of thorns and roses", "una corte de rosas y espinas"],
    author: "Sarah J. Maas",
    authorAliases: ["maas", "sarah maas", "sarah j maas", "sarah j. maas"],
    books: [
      {
        order: 1,
        titles: ["A Court of Thorns and Roses", "Una corte de rosas y espinas"],
        isbns: ["9781619634442", "9781619634459", "9788416867097"],
        year: 2015,
      },
      {
        order: 2,
        titles: ["A Court of Mist and Fury", "Una corte de niebla y furia"],
        isbns: ["9781619634466", "9781619634473"],
        year: 2016,
      },
      {
        order: 3,
        titles: ["A Court of Wings and Ruin", "Una corte de alas y ruina"],
        isbns: ["9781619634480", "9781619634497"],
        year: 2017,
      },
      {
        order: 4,
        titles: ["A Court of Frost and Starlight", "Una corte de escarcha y luceros"],
        isbns: ["9781681196091"],
        year: 2018,
      },
      {
        order: 5,
        titles: ["A Court of Silver Flames", "Una corte de llamas plateadas"],
        isbns: ["9781635575606"],
        year: 2021,
      },
    ],
  },

  // ── Sarah J. Maas — Throne of Glass ──────────────────────────────────────
  {
    name: "Throne of Glass",
    aliases: ["throne of glass", "trono de cristal"],
    author: "Sarah J. Maas",
    authorAliases: ["maas", "sarah maas", "sarah j maas"],
    books: [
      { order: 1, titles: ["Throne of Glass", "Trono de cristal"], isbns: ["9781619630345"], year: 2012 },
      { order: 2, titles: ["Crown of Midnight", "Corona de medianoche"], isbns: ["9781619630352"], year: 2013 },
      { order: 3, titles: ["Heir of Fire", "Heredera del fuego"], isbns: ["9781619630369"], year: 2014 },
      { order: 4, titles: ["Queen of Shadows", "Reina de las sombras"], isbns: ["9781619636071"], year: 2015 },
      { order: 5, titles: ["Empire of Storms", "Imperio de tormentas"], isbns: ["9781619636088"], year: 2016 },
      { order: 6, titles: ["Tower of Dawn", "Torre del alba"], isbns: ["9781681191898"], year: 2017 },
      { order: 7, titles: ["Kingdom of Ash", "Reino de cenizas"], isbns: ["9781619636101"], year: 2018 },
    ],
  },

  // ── Colleen Hoover — It Ends With Us ─────────────────────────────────────
  {
    name: "It Ends With Us",
    aliases: ["it ends with us", "romper el círculo", "romper el circulo"],
    author: "Colleen Hoover",
    authorAliases: ["hoover", "colleen hoover", "cohо"],
    books: [
      {
        order: 1,
        titles: ["It Ends with Us", "Romper el círculo"],
        isbns: ["9781501110368", "9781501171345", "9788408250586"],
        year: 2016,
      },
      {
        order: 2,
        titles: ["It Starts with Us", "Empieza con nosotros"],
        isbns: ["9781668001226", "9788408273301"],
        year: 2022,
      },
    ],
  },

  // ── Dan Brown — Robert Langdon ─────────────────────────────────────────────
  {
    name: "Robert Langdon",
    aliases: ["robert langdon", "dan brown series", "langdon"],
    author: "Dan Brown",
    authorAliases: ["brown", "dan brown"],
    books: [
      {
        order: 1,
        titles: ["Angels & Demons", "Ángeles y demonios", "Angeles y demonios"],
        isbns: ["9780743493468", "9780671027360"],
        year: 2000,
      },
      {
        order: 2,
        titles: ["The Da Vinci Code", "El código Da Vinci", "El codigo Da Vinci"],
        isbns: ["9780385504201", "9780307474278", "9788408041832"],
        year: 2003,
      },
      {
        order: 3,
        titles: ["The Lost Symbol", "El símbolo perdido"],
        isbns: ["9780385504225", "9780307951793"],
        year: 2009,
      },
      {
        order: 4,
        titles: ["Inferno", "Inferno"],
        isbns: ["9780385537858", "9780804172998"],
        year: 2013,
      },
      {
        order: 5,
        titles: ["Origin", "Origen"],
        isbns: ["9780385514231", "9780385543200"],
        year: 2017,
      },
    ],
  },

  // ── J.R.R. Tolkien — The Lord of the Rings ───────────────────────────────
  {
    name: "The Lord of the Rings",
    aliases: ["lord of the rings", "el señor de los anillos", "lotr"],
    author: "J.R.R. Tolkien",
    authorAliases: ["tolkien", "jrr tolkien", "j.r.r. tolkien", "j r r tolkien"],
    books: [
      {
        order: 0,
        titles: ["The Hobbit", "El hobbit", "El Hobbit"],
        isbns: ["9780547928227", "9780618968633", "9788445073971"],
        year: 1937,
      },
      {
        order: 1,
        titles: ["The Fellowship of the Ring", "La comunidad del anillo"],
        isbns: ["9780618574940", "9780544003415"],
        year: 1954,
      },
      {
        order: 2,
        titles: ["The Two Towers", "Las dos torres"],
        isbns: ["9780618574957", "9780544003422"],
        year: 1954,
      },
      {
        order: 3,
        titles: ["The Return of the King", "El retorno del rey"],
        isbns: ["9780618574964", "9780544003439"],
        year: 1955,
      },
    ],
  },

  // ── Andy Weir — standalones ───────────────────────────────────────────────
  {
    name: "Andy Weir",
    aliases: [],
    author: "Andy Weir",
    authorAliases: ["weir", "andy weir"],
    books: [
      {
        order: 0,
        titles: ["The Martian", "El marciano"],
        isbns: ["9780553418026", "9780804139021"],
        year: 2011,
      },
      {
        order: 0,
        titles: ["Artemis", "Artemis"],
        isbns: ["9780553448122", "9780525572664"],
        year: 2017,
      },
      {
        order: 0,
        titles: ["Project Hail Mary", "Salvar el proyecto Ares", "Proyecto Hail Mary"],
        isbns: ["9780593135204", "9780593390085"],
        year: 2021,
      },
    ],
  },

  // ── Frank Herbert — Dune ─────────────────────────────────────────────────
  {
    name: "Dune Chronicles",
    aliases: ["dune", "dune chronicles", "las crónicas de dune"],
    author: "Frank Herbert",
    authorAliases: ["herbert", "frank herbert"],
    books: [
      {
        order: 1,
        titles: ["Dune", "Duna"],
        isbns: ["9780441172719", "9780593099322", "9780340960196"],
        year: 1965,
      },
      {
        order: 2,
        titles: ["Dune Messiah", "El mesías de Dune"],
        isbns: ["9780441172696", "9780593098233"],
        year: 1969,
      },
      {
        order: 3,
        titles: ["Children of Dune", "Los hijos de Dune"],
        isbns: ["9780441104024", "9780593098240"],
        year: 1976,
      },
    ],
  },

  // ── Cassandra Clare — The Mortal Instruments ──────────────────────────────
  {
    name: "The Mortal Instruments",
    aliases: ["mortal instruments", "los instrumentos mortales"],
    author: "Cassandra Clare",
    authorAliases: ["clare", "cassandra clare"],
    books: [
      { order: 1, titles: ["City of Bones", "Ciudad de hueso"], isbns: ["9781416914280"], year: 2007 },
      { order: 2, titles: ["City of Ashes", "Ciudad de ceniza"], isbns: ["9781416972235"], year: 2008 },
      { order: 3, titles: ["City of Glass", "Ciudad de cristal"], isbns: ["9781416972242"], year: 2009 },
      { order: 4, titles: ["City of Fallen Angels", "Ciudad de ángeles caídos"], isbns: ["9781442403543"], year: 2011 },
      { order: 5, titles: ["City of Lost Souls", "Ciudad de almas perdidas"], isbns: ["9781442416864"], year: 2012 },
      { order: 6, titles: ["City of Heavenly Fire", "Ciudad de fuego celestial"], isbns: ["9781442416901"], year: 2014 },
    ],
  },

  // ── Carlos Ruiz Zafón — El cementerio de los libros olvidados ────────────
  {
    name: "El cementerio de los libros olvidados",
    aliases: ["cementerio de los libros olvidados", "cemetery of forgotten books", "barcelona cycle"],
    author: "Carlos Ruiz Zafón",
    authorAliases: ["ruiz zafon", "carlos ruiz zafon", "zafon"],
    books: [
      {
        order: 1,
        titles: ["La sombra del viento", "The Shadow of the Wind"],
        isbns: ["9788408163435", "9780143034902", "9781594200229"],
        year: 2001,
      },
      {
        order: 2,
        titles: ["El juego del ángel", "The Angel's Game"],
        isbns: ["9788408083245", "9780385341059"],
        year: 2008,
      },
      {
        order: 3,
        titles: ["El prisionero del cielo", "The Prisoner of Heaven"],
        isbns: ["9788408002802", "9780062206589"],
        year: 2011,
      },
      {
        order: 4,
        titles: ["El laberinto de los espíritus", "The Labyrinth of the Spirits"],
        isbns: ["9788408155805", "9780062668721"],
        year: 2016,
      },
    ],
  },

  // ── Isabel Allende ────────────────────────────────────────────────────────
  {
    name: "La casa de los espíritus",
    aliases: ["la casa de los espiritus", "the house of the spirits"],
    author: "Isabel Allende",
    authorAliases: ["allende", "isabel allende"],
    books: [
      {
        order: 0,
        titles: ["La casa de los espíritus", "The House of the Spirits"],
        isbns: ["9780553383805", "9780671700799"],
        year: 1982,
      },
    ],
  },
];

// ─── Translation Map ──────────────────────────────────────────────────────────

/**
 * Maps known translated titles (normalized) → canonical work info.
 * Built from KNOWN_SERIES at module init time.
 */
const _translationMap = new Map<string, KnownWorkMetadata>();
const _isbnMap = new Map<string, KnownWorkMetadata>();

function normalizeForLookup(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // strip diacritics
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Build maps at module load
for (const series of KNOWN_SERIES) {
  for (const book of series.books) {
    // Use first title as canonical (English original)
    const canonicalTitle = book.titles[0]!;

    // All titles after the first are translations/variants
    for (let i = 0; i < book.titles.length; i++) {
      const t = book.titles[i]!;
      const meta: KnownWorkMetadata = {
        originalTitle: canonicalTitle,
        translatedTitle: t,
        author: series.author,
        seriesName: series.books.length > 1 ? series.name : undefined,
        seriesOrder: series.books.length > 1 ? book.order : undefined,
        year: book.year,
      };
      _translationMap.set(normalizeForLookup(t), meta);
    }

    // ISBN → metadata
    for (const isbn of book.isbns ?? []) {
      const meta: KnownWorkMetadata = {
        originalTitle: canonicalTitle,
        translatedTitle: canonicalTitle,
        author: series.author,
        seriesName: series.books.length > 1 ? series.name : undefined,
        seriesOrder: series.books.length > 1 ? book.order : undefined,
        year: book.year,
      };
      _isbnMap.set(isbn, meta);
    }
  }
}

// ─── Public lookup functions ──────────────────────────────────────────────────

/**
 * Look up known metadata by ISBN-13.
 * Returns null if not found.
 */
export function lookupByIsbn(isbn13: string): KnownWorkMetadata | null {
  return _isbnMap.get(isbn13) ?? null;
}

/**
 * Look up known metadata by title (supports translations).
 * Normalizes input before matching (diacritic-insensitive, lowercase).
 */
export function lookupByTitle(title: string): KnownWorkMetadata | null {
  return _translationMap.get(normalizeForLookup(title)) ?? null;
}

/**
 * Is this exactly the name of an author the catalog knows?
 *
 * Deliberately an exact match on the whole normalized string, against the
 * canonical name and its aliases — not the loose two-way `includes` that
 * `lookupSeriesByAuthor` uses for enrichment. This answer decides whether a
 * user's query becomes an `inauthor:` search, and a substring match would fire
 * on any query that happens to sit inside a name.
 */
export function isKnownAuthorName(query: string): boolean {
  const wanted = normalizeForLookup(query);
  if (!wanted) return false;
  return KNOWN_SERIES.some((s) =>
    [s.author, ...s.authorAliases].some((a) => normalizeForLookup(a) === wanted)
  );
}

/**
 * Is this the name of a series the catalog knows ("Harry Potter", "Dune")?
 *
 * Series names are the one class of title the shape rules get most wrong: they
 * are short, capitalized, and frequently a character's name, so they look like
 * people. The catalog settles it without guessing.
 */
export function isKnownSeriesName(query: string): boolean {
  const wanted = normalizeForLookup(query);
  if (!wanted) return false;
  return KNOWN_SERIES.some((s) =>
    [s.name, ...s.aliases].some((n) => normalizeForLookup(n) === wanted)
  );
}

/**
 * All known title variants (original + translations) for a title we recognize.
 * Returns [] when the title isn't in the catalog.
 */
export function getTitleVariants(title: string): string[] {
  const wanted = normalizeForLookup(title);
  for (const series of KNOWN_SERIES) {
    for (const book of series.books) {
      if (book.titles.some((t) => normalizeForLookup(t) === wanted)) {
        return [...book.titles];
      }
    }
  }
  return [];
}

/**
 * Find series data for a known author (normalized, partial match allowed).
 */
export function lookupSeriesByAuthor(author: string): KnownSeries[] {
  const normalized = normalizeForLookup(author);
  return KNOWN_SERIES.filter((s) =>
    [s.author, ...s.authorAliases].some((a) =>
      normalizeForLookup(a).includes(normalized) || normalized.includes(normalizeForLookup(a))
    )
  );
}

/**
 * Given a found work title + author, try to enrich it with series data.
 * Returns null if no known series match.
 */
export function inferSeriesData(
  title: string,
  author: string
): { seriesName: string; seriesOrder: number } | null {
  const normTitle = normalizeForLookup(title);
  const normAuthor = normalizeForLookup(author);

  for (const series of KNOWN_SERIES) {
    // Check author match
    const authorMatch = [series.author, ...series.authorAliases].some((a) => {
      const normA = normalizeForLookup(a);
      return normAuthor.includes(normA) || normA.includes(normAuthor);
    });
    if (!authorMatch) continue;

    // Check title match against any known title for any book in this series
    for (const book of series.books) {
      for (const knownTitle of book.titles) {
        const normKnown = normalizeForLookup(knownTitle);
        // Exact or contained match
        if (normTitle === normKnown || normKnown.includes(normTitle) || normTitle.includes(normKnown)) {
          return { seriesName: series.name, seriesOrder: book.order };
        }
        // Token overlap ≥ 80%
        const titleTokens = normTitle.split(" ").filter((t) => t.length > 2);
        const knownTokens = normKnown.split(" ").filter((t) => t.length > 2);
        if (titleTokens.length && knownTokens.length) {
          const setKnown = new Set(knownTokens);
          const hits = titleTokens.filter((t) => setKnown.has(t)).length;
          if (hits / titleTokens.length >= 0.8) {
            return { seriesName: series.name, seriesOrder: book.order };
          }
        }
      }
    }
  }
  return null;
}

/**
 * Given a query title, find if it's a known translation and return
 * the canonical English title for a broader search.
 */
export function getOriginalTitle(translatedTitle: string): string | null {
  const meta = lookupByTitle(translatedTitle);
  if (!meta) return null;
  return meta.originalTitle !== meta.translatedTitle ? meta.originalTitle : null;
}

/**
 * Generate search query suggestions for a title that might be translated.
 * Returns [originalTitle?, ...tokens] for use in fallback searches.
 */
export function getSearchFallbacks(title: string): string[] {
  const fallbacks: string[] = [];
  const meta = lookupByTitle(title);
  if (meta) {
    if (meta.originalTitle !== title) fallbacks.push(meta.originalTitle);
    if (meta.seriesName) fallbacks.push(meta.seriesName);
  }
  return fallbacks;
}
