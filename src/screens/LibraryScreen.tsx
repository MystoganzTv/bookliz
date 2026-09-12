import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useScrollToTop } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { FlatList, Image, Linking, ListRenderItem, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Badge } from "../components/Badge";
import { BooklizDialog } from "../components/BooklizDialog";
import { BookCover, FormatBadge, isMutedBook } from "../components/BookCover";
import { BookContextMenu } from "../components/BookContextMenu";
import { BookListSheet } from "../components/BookListSheet";
import { BookStatusSheet } from "../components/BookStatusSheet";
import { FilterChip } from "../components/FilterChip";
import { FilterSheet, FilterState, DEFAULT_FILTERS, activeFilterCount, FORMAT_GROUPS } from "../components/FilterSheet";
import { Screen } from "../components/Screen";
import { useBookliz } from "../data/BooklizContext";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";
import { Book } from "../types/models";
import { AppColors, fonts, radii, shadows, spacing } from "../theme/theme";
import { useColors, useTheme } from "../theme/ThemeContext";
import { wantsToAcquire } from "../data/shelfRules";
import { normalizeBookGenres } from "../utils/genres";
import { languageCode } from "../utils/languageUtils";
import { CreateListSheet } from "../components/CreateListSheet";
import { ScalePressable } from "../components/ScalePressable";

type ViewMode = "grid" | "list";
type LibraryFilter = "all" | "reading" | "read" | "wishlist";

const SIMPLE_FILTERS: { key: LibraryFilter; labelKey: string }[] = [
  { key: "all",      labelKey: "library.filterAll" },
  { key: "reading",  labelKey: "library.filterInProgress" },
  { key: "read",     labelKey: "library.filterFinished" },
  { key: "wishlist", labelKey: "library.filterWishlist" },
];

export function LibraryScreen() {
  const c = useColors();
  const { isDark } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => createStyles(c, isDark), [c, isDark]);
  const activeControlTextColor = isDark ? c.ink : "#FFFFFF";
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { books, getAuthor, readingSessions, userLists, createUserList, deleteUserList, renameUserList, deleteBook, updateBookStatus } = useBookliz();
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [advFilters, setAdvFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState<string | null>(null);
  const [createListOpen, setCreateListOpen] = useState(false);
  const [renamingList, setRenamingList] = useState<{ id: string; name: string; emoji?: string } | null>(null);
  const [deleteListTarget, setDeleteListTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [contextBook, setContextBook] = useState<{ book: Book; authorName: string } | null>(null);
  const [statusSheetBook, setStatusSheetBook] = useState<Book | null>(null);
  const [listSheetBookId, setListSheetBookId] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);

  const openAmazon = (book: Book, authorName: string) => {
    const raw = book.isbn?.replace(/[^0-9X]/gi, "") ?? "";
    // Amazon /dp/ requires an ISBN-10 (ASIN). Convert ISBN-13 → ISBN-10 when prefix is 978.
    let asin: string | null = null;
    if (raw.length === 10) {
      asin = raw;
    } else if (raw.length === 13 && raw.startsWith("978")) {
      const nine = raw.slice(3, 12);
      let sum = 0;
      for (let i = 0; i < 9; i++) sum += parseInt(nine[i]) * (10 - i);
      const check = (11 - (sum % 11)) % 11;
      asin = nine + (check === 10 ? "X" : String(check));
    }
    const url = asin
      ? `https://www.amazon.com/dp/${asin}?tag=bookliz-20`
      : raw.length > 0
        ? `https://www.amazon.com/s?k=${raw}&tag=bookliz-20`
        : `https://www.amazon.com/s?k=${encodeURIComponent(`${book.title} ${authorName}`)}&tag=bookliz-20`;
    void Linking.openURL(url);
  };

  const clearFilters = () => {
    setQuery("");
    setFilter("all");
    setGenreFilter(null);
    setTagFilter(null);
    setListFilter(null);
    setAdvFilters(DEFAULT_FILTERS);
  };

  // Only filter by query when 2+ chars — avoids "no match" flash on first keystroke
  const effectiveQuery = deferredQuery.trim().length >= 2 ? deferredQuery.trim() : "";

  // Only the two shown in the header MiniStats. The "collector shelves" counts
  // (reading now, saga momentum, wishlist pressure, unfinished) were computed on
  // every render for a section that was never rendered — removed.
  const ownedCount = books.filter((b) => b.userStatus.ownership === "owned").length;
  const readCount = books.filter((b) => b.userStatus.status === "read").length;

  const latestLogByBook = useMemo(
    () =>
      readingSessions.reduce<Record<string, string>>((acc, session) => {
        if (!acc[session.bookId] || session.date > acc[session.bookId]) {
          acc[session.bookId] = session.date;
        }
        return acc;
      }, {}),
    [readingSessions]
  );

  // Collect all clean genres and tags available in the library
  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    for (const book of books) {
      for (const g of normalizeBookGenres(book.genre)) {
        if (g !== "Uncategorized") set.add(g);
      }
    }
    return Array.from(set).sort();
  }, [books]);

  const availableTags = useMemo(() => {
    const set = new Set<string>();
    for (const book of books) {
      for (const tag of book.tags ?? []) {
        if (tag.trim()) set.add(tag.trim());
      }
    }
    return Array.from(set).sort();
  }, [books]);

  const filteredBooks = useMemo(() => {
    const normalized = effectiveQuery.toLowerCase();
    return books
      .filter((book) => {
        if (filter === "read") return book.userStatus.status === "read";
        if (filter === "reading") return book.userStatus.status === "reading";
        if (filter === "wishlist") return wantsToAcquire(book.userStatus);
        return true;
      })
      .filter((book) => {
        if (!genreFilter) return true;
        return normalizeBookGenres(book.genre).includes(genreFilter);
      })
      .filter((book) => {
        if (!tagFilter) return true;
        return (book.tags ?? []).includes(tagFilter);
      })
      .filter((book) => {
        if (!listFilter) return true;
        const list = userLists.find((l) => l.id === listFilter);
        return list ? list.bookIds.includes(book.id) : true;
      })
      .filter((book) => {
        if (!normalized) return true;
        const author = getAuthor(book.authorId)?.name ?? "";
        return [
          book.title,
          author,
          book.genre.join(" "),
          book.seriesName ?? "",
          book.isbn,
          book.publisher,
          book.language,
          (book.tags ?? []).join(" ")
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      })
      .filter((book) => {
        // Format filter
        if (advFilters.formats.size === 0) return true;
        const fmt = book.format as string;
        for (const fg of FORMAT_GROUPS) {
          if (advFilters.formats.has(fg.key) && fg.formats.includes(fmt as never)) return true;
        }
        return false;
      })
      .filter((book) => {
        if (advFilters.languages.size === 0) return true;
        // Match against languageCode (ISO 639-1) or language string
        const code = book.languageCode?.toLowerCase() ?? languageCode(book.language);
        return code ? advFilters.languages.has(code as never) : false;
      })
      .sort((a, b) => {
        const s = advFilters.sort;
        if (s === "rating") return (b.userStatus.rating ?? 0) - (a.userStatus.rating ?? 0);
        if (s === "dateRead") return (b.userStatus.finishDate ?? "").localeCompare(a.userStatus.finishDate ?? "");
        if (s === "author") return (getAuthor(a.authorId)?.name ?? "").localeCompare(getAuthor(b.authorId)?.name ?? "");
        if (s === "seriesOrder") return (a.seriesName ?? "").localeCompare(b.seriesName ?? "") || (a.sagaOrder ?? 99) - (b.sagaOrder ?? 99);
        if (s === "releaseDate") return b.publishedDate.localeCompare(a.publishedDate);
        if (s === "mostRecentlyLogged") return (latestLogByBook[b.id] ?? "").localeCompare(latestLogByBook[a.id] ?? "");
        return (a.userStatus.personalRanking ?? 999) - (b.userStatus.personalRanking ?? 999);
      });
  }, [books, effectiveQuery, filter, genreFilter, tagFilter, listFilter, userLists, getAuthor, latestLogByBook, advFilters]);

  const renderGridItem = useCallback<ListRenderItem<Book>>(
    ({ item: book }) => (
      <GridBookTile
        book={book}
        authorName={getAuthor(book.authorId)?.name ?? ""}
        styles={styles}
        onPress={() => navigation.navigate("BookDetail", { bookId: book.id })}
        onMenu={() => setContextBook({ book, authorName: getAuthor(book.authorId)?.name ?? "" })}
      />
    ),
    [getAuthor, navigation, styles]
  );

  const renderRowItem = useCallback<ListRenderItem<Book>>(
    ({ item: book }) => (
      <LibraryRowCard
        book={book}
        authorName={getAuthor(book.authorId)?.name ?? ""}
        latestLogDate={latestLogByBook[book.id]}
        styles={styles}
        onPress={() => navigation.navigate("BookDetail", { bookId: book.id })}
        onMenu={() => setContextBook({ book, authorName: getAuthor(book.authorId)?.name ?? "" })}
        onOpenSeries={
          book.seriesId
            ? () => navigation.navigate("SeriesTracker", { seriesId: book.seriesId! })
            : undefined
        }
        onBuy={() => openAmazon(book, getAuthor(book.authorId)?.name ?? "")}
      />
    ),
    [getAuthor, latestLogByBook, navigation, styles]
  );

  // Everything above the books scrolls with them, so it lives in the list header
  // rather than in a parent ScrollView. Nesting a FlatList inside a ScrollView
  // would defeat virtualisation entirely — the outer view has no bounded height,
  // so the inner list renders every row.
  const listHeader = (
    <>
      {/* ── Header ── */}
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>{t("library.eyebrow")}</Text>
          <Text style={styles.title}>{t("library.title")}</Text>
        </View>
        <View style={styles.miniStats}>
          <MiniStat value={String(books.length)} label={t("library.tracked")} styles={styles} />
          <MiniStat value={String(readCount)} label={t("library.read")} styles={styles} />
          <MiniStat value={String(ownedCount)} label={t("library.owned")} styles={styles} />
        </View>
      </View>

      {/* ── Lists rail — compact pills ── */}
      {userLists.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.listsRail} contentContainerStyle={styles.listsRailContent}>
          <Pressable accessibilityRole="button"
            style={[styles.listPill, !listFilter && styles.listPillActive]}
            onPress={() => setListFilter(null)}
          >
            <Text style={[styles.listPillText, !listFilter && styles.listPillTextActive]}>{t("library.filterAll")}</Text>
          </Pressable>
          {userLists.map((list) => {
            const active = listFilter === list.id;
            return (
              <Pressable accessibilityRole="button"
                key={list.id}
                style={[styles.listPill, active && styles.listPillActive]}
                onPress={() => setListFilter(active ? null : list.id)}
                onLongPress={() => setRenamingList({ id: list.id, name: list.name, emoji: list.emoji })}
              >
                <Text style={styles.listPillEmoji}>{list.emoji ?? "📚"}</Text>
                <Text style={[styles.listPillText, active && styles.listPillTextActive]} numberOfLines={1}>{list.name}</Text>
              </Pressable>
            );
          })}
          <Pressable
            style={styles.listPillNew}
            onPress={() => setCreateListOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t("a11y.newList")}
          >
            <Ionicons name="add" size={14} color={c.teal} />
          </Pressable>
        </ScrollView>
      ) : null}

      {/* ── Search + controls ── */}
      <View style={styles.searchRow}>
        <TextInput
          placeholder={t("library.searchPlaceholder")}
          placeholderTextColor={c.gray}
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          maxLength={60}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {/* Filter button */}
        <Pressable
          style={[styles.controlBtn, activeFilterCount(advFilters) > 0 && styles.controlBtnActive]}
          onPress={() => setFilterSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={
            activeFilterCount(advFilters) > 0
              ? t("a11y.filtersActive", { count: activeFilterCount(advFilters) })
              : t("a11y.filters")
          }
        >
          <Ionicons name="options-outline" size={17} color={activeFilterCount(advFilters) > 0 ? activeControlTextColor : c.ink} />
          {activeFilterCount(advFilters) > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount(advFilters)}</Text>
            </View>
          )}
        </Pressable>
        {/* Grid / list toggle */}
        <Pressable
          style={styles.controlBtn}
          onPress={() => setViewMode((v) => v === "grid" ? "list" : "grid")}
          accessibilityRole="button"
          accessibilityLabel={t("a11y.toggleView")}
        >
          <Ionicons
            name={viewMode === "grid" ? "grid-outline" : "reorder-three-outline"}
            size={17}
            color={c.ink}
          />
        </Pressable>
      </View>

      {/* ── Simple filter tabs ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRail} contentContainerStyle={styles.chipRailContent}>
        {SIMPLE_FILTERS.map((item) => (
          <Pressable accessibilityRole="button"
            key={item.key}
            style={[styles.simpleTab, filter === item.key && styles.simpleTabActive]}
            onPress={() => setFilter(item.key)}
          >
            <Text style={[styles.simpleTabText, filter === item.key && styles.simpleTabTextActive]}>
              {t(item.labelKey)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </>
  );

  const listEmpty =
    books.length === 0 ? (
      /* ── Library is empty ── */
      <View style={styles.emptyState}>
        <Ionicons name="library-outline" size={44} color={c.teal} />
        <Text style={styles.emptyTitle}>{t("library.emptyTitle")}</Text>
        <Text style={styles.emptySub}>{t("library.emptyBody")}</Text>
        <Pressable
          style={styles.emptyButton}
          onPress={() => navigation.navigate("BookIntake")}
          accessibilityRole="button"
          accessibilityLabel={t("common.addBook")}
        >
          <Text style={styles.emptyButtonText}>{t("common.addBook")}</Text>
        </Pressable>
      </View>
    ) : (
      /* ── No search/filter matches ── */
      <NoMatchState query={query} styles={styles} c={c} onClear={clearFilters} />
    );

  const isGrid = viewMode === "grid";
  // Library owns its scroll (a FlatList, not the Screen's ScrollView), so it
  // has to register for the tap-the-active-tab-to-go-up behaviour itself.
  const listRef = useRef<FlatList<Book>>(null);
  useScrollToTop(listRef);

  return (
    <Screen scroll={false}>
      <FlatList
        ref={listRef}
        /* numColumns cannot change on a mounted list — remounting on view mode
           switch is the supported way to flip between grid and rows. */
        key={viewMode}
        data={filteredBooks}
        extraData={latestLogByBook}
        keyExtractor={(book) => book.id}
        renderItem={isGrid ? renderGridItem : renderRowItem}
        numColumns={isGrid ? 3 : 1}
        columnWrapperStyle={isGrid ? styles.gridRow : undefined}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        removeClippedSubviews
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
      />

      {/* Create list sheet */}
      <CreateListSheet
        open={createListOpen}
        mode="create"
        onSave={(name, emoji) => {
          createUserList(name, emoji);
          setCreateListOpen(false);
        }}
        onClose={() => setCreateListOpen(false)}
      />

      {/* Rename list sheet */}
      <CreateListSheet
        open={Boolean(renamingList)}
        mode="rename"
        initialName={renamingList?.name ?? ""}
        initialEmoji={renamingList?.emoji ?? "📚"}
        onSave={(name, emoji) => {
          if (renamingList) {
            renameUserList(renamingList.id, name, emoji);
            // If we were filtering by this list keep the filter active
          }
          setRenamingList(null);
        }}
        onDelete={() => {
          const target = renamingList ? { id: renamingList.id, name: renamingList.name } : null;
          // Close the rename sheet first — a Modal opening while another closes
          // never shows on iOS.
          setRenamingList(null);
          if (target) setTimeout(() => setDeleteListTarget(target), 350);
        }}
        onClose={() => setRenamingList(null)}
      />

      {/* Delete list confirmation */}
      <BooklizDialog
        open={Boolean(deleteListTarget)}
        title={t("lists.deleteConfirmTitle")}
        body={t("lists.deleteConfirmBody", { name: deleteListTarget?.name ?? "" })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        variant="destructive"
        onConfirm={() => {
          if (deleteListTarget) {
            deleteUserList(deleteListTarget.id);
            if (listFilter === deleteListTarget.id) setListFilter(null);
          }
          setDeleteListTarget(null);
        }}
        onCancel={() => setDeleteListTarget(null)}
      />

      {/* Filter sheet */}
      <FilterSheet
        open={filterSheetOpen}
        filters={advFilters}
        resultCount={filteredBooks.length}
        onApply={(f) => setAdvFilters(f)}
        onClose={() => setFilterSheetOpen(false)}
      />

      {/* Book context menu (3-dot) */}
      <BookContextMenu
        open={Boolean(contextBook)}
        book={contextBook?.book ?? null}
        authorName={contextBook?.authorName ?? ""}
        onClose={() => setContextBook(null)}
        onViewDetails={() => {
          if (contextBook) navigation.navigate("BookDetail", { bookId: contextBook.book.id });
        }}
        onUpdateStatus={() => {
          if (contextBook) setStatusSheetBook(contextBook.book);
        }}
        onLogSession={() => {
          if (contextBook) navigation.navigate("AddReadingSession", { bookId: contextBook.book.id });
        }}
        onOpenSeries={
          contextBook?.book.seriesId
            ? () => navigation.navigate("SeriesTracker", { seriesId: contextBook.book.seriesId! })
            : undefined
        }
        onViewAuthor={
          contextBook?.book.authorId
            ? () => navigation.navigate("AuthorBooks", { authorId: contextBook.book.authorId, authorName: contextBook.authorName })
            : undefined
        }
        onAddToList={() => {
          if (contextBook) setListSheetBookId(contextBook.book.id);
        }}
        onBuy={() => {
          if (!contextBook) return;
          openAmazon(contextBook.book, contextBook.authorName);
        }}
        onRemove={() => {
          if (contextBook) setDeleteTarget({ id: contextBook.book.id, title: contextBook.book.title });
        }}
      />

      {/* Add-to-list sheet triggered from context menu */}
      {listSheetBookId ? (
        <BookListSheet
          open={Boolean(listSheetBookId)}
          bookId={listSheetBookId}
          onClose={() => setListSheetBookId(null)}
        />
      ) : null}

      {/* Status sheet triggered from context menu */}
      {statusSheetBook && (
        <BookStatusSheet
          open={Boolean(statusSheetBook)}
          currentStatus={statusSheetBook.userStatus.status}
          currentRating={statusSheetBook.userStatus.rating}
          currentOwned={statusSheetBook.userStatus.ownership === "owned"}
          onSave={(status, rating, owned) => {
            updateBookStatus(statusSheetBook.id, status, rating, owned);
            setStatusSheetBook(null);
          }}
          onClose={() => setStatusSheetBook(null)}
        />
      )}

      {/* Delete confirmation dialog */}
      <BooklizDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget?.title ?? ""}
        body="Remove this book from your library?"
        confirmLabel="Remove"
        cancelLabel="Keep it"
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) deleteBook(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </Screen>
  );
}

function NoMatchState({
  query,
  styles,
  c,
  onClear
}: {
  query: string;
  styles: ReturnType<typeof createStyles>;
  c: AppColors;
  onClear: () => void;
}) {
  const hasQuery = query.trim().length > 0;
  return (
    <View style={styles.noMatchWrap}>
      {/* Icon + badge anchored together */}
      <View style={styles.noMatchIconWrap}>
        <View style={styles.noMatchRingOuter}>
          <View style={styles.noMatchRingInner}>
            <Image
              source={require("../../assets/brand/bookliz-icon.png")}
              style={styles.noMatchIcon}
              resizeMode="contain"
            />
          </View>
        </View>
        <View style={styles.noMatchBadge}>
          <Ionicons name="search-outline" size={14} color="#fff" />
        </View>
      </View>

      <Text style={styles.noMatchTitle}>Sin resultados</Text>
      <Text style={styles.noMatchSub}>
        {hasQuery
          ? `No encontramos libros para "${query.trim()}"`
          : "Los filtros activos no tienen coincidencias"}
      </Text>

      <Pressable accessibilityRole="button" style={styles.noMatchClearBtn} onPress={onClear}>
        <Ionicons name="refresh-outline" size={14} color={c.teal} />
        <Text style={styles.noMatchClearText}>Limpiar búsqueda y filtros</Text>
      </Pressable>
    </View>
  );
}

function MiniStat({ value, label, styles }: { value: string; label: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniStatVal}>{value}</Text>
      <Text style={styles.miniStatLbl}>{label}</Text>
    </View>
  );
}

function GridBookTile({
  book,
  authorName,
  styles,
  onPress,
  onMenu,
}: {
  book: Book;
  authorName: string;
  styles: ReturnType<typeof createStyles>;
  onPress: () => void;
  onMenu: () => void;
}) {
  const { t } = useI18n();
  const hasSeries = book.seriesName && book.seriesNumber;
  // Same dimming rule as BookCover (list mode) — keeps grid & list consistent
  const muted = isMutedBook(book);
  // Render cover image directly — bypasses BookCover dimension constraints
  const coverEl = book.coverImageUri ? (
    <View style={styles.tileCoverWrap}>
      <Image
        source={{ uri: book.coverImageUri }}
        style={styles.tileCoverImg}
        resizeMode="contain"
      />
      {muted ? <View style={styles.tileMutedOverlay} /> : null}
    </View>
  ) : (
    <View style={[styles.tileCoverWrap, styles.tileCoverFallback]}>
      <Text numberOfLines={3} style={styles.tileCoverFallbackTitle}>{book.title}</Text>
      {authorName ? <Text numberOfLines={1} style={styles.tileCoverFallbackAuthor}>{authorName}</Text> : null}
      {muted ? <View style={styles.tileMutedOverlay} /> : null}
    </View>
  );

  return (
    <ScalePressable accessibilityRole="button" style={styles.bookTile} onPress={onPress} pressScale={0.95}>
      <View style={styles.tileCoverContainer}>
        {coverEl}
        <FormatBadge format={book.format} size={13} style={styles.tileFormatBadge} />
        <Pressable
          style={styles.tileMenuBtn}
          onPress={onMenu}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("a11y.moreFor", { title: book.title })}
        >
          <Ionicons name="ellipsis-horizontal" size={14} color="#fff" />
        </Pressable>
      </View>
      <Text numberOfLines={1} style={styles.bookTitle}>{book.title}</Text>
      <Text numberOfLines={1} style={styles.bookAuthor}>{authorName}</Text>
      {hasSeries ? (
        <Text numberOfLines={1} style={styles.bookSeries}>
          Book {book.seriesNumber} · {book.seriesName}
        </Text>
      ) : null}
    </ScalePressable>
  );
}

function LibraryRowCard({
  book,
  authorName,
  styles,
  onPress,
  onMenu,
  onOpenSeries,
  onBuy,
}: {
  book: Book;
  authorName: string;
  latestLogDate?: string;
  styles: ReturnType<typeof createStyles>;
  onPress: () => void;
  onMenu: () => void;
  onOpenSeries?: () => void;
  onBuy: () => void;
}) {
  const { t } = useI18n();
  const c = useColors();
  const progress = book.userStatus.progressPercent ?? 0;
  const isReading = book.userStatus.status === "reading";
  const isRead = book.userStatus.status === "read";
  const isDnf = book.userStatus.status === "dnf";

  return (
    <Pressable accessibilityRole="button" style={styles.rowCard} onPress={onPress}>
      {/* Portrait cover */}
      <BookCover book={book} size="sm" style={styles.rowCover} hideProgress />

      {/* Content */}
      <View style={styles.rowCopy}>
        <View style={styles.rowTitleRow}>
          <Text numberOfLines={2} style={styles.rowTitle}>{book.title}</Text>
        </View>
        <Text numberOfLines={1} style={styles.rowAuthor}>{authorName}</Text>

        {book.seriesName ? (
          <Pressable accessibilityRole="button" onPress={onOpenSeries}>
            <Text numberOfLines={1} style={styles.rowSeries}>
              {book.seriesNumber ? `Book ${book.seriesNumber} · ` : ""}{book.seriesName}
            </Text>
          </Pressable>
        ) : null}

        {isReading && progress > 0 ? (
          <View style={styles.rowProgressWrap}>
            <View style={styles.rowProgressTrack}>
              <View style={[styles.rowProgressFill, { width: `${progress}%` as `${number}%` }]} />
            </View>
            <Text style={styles.rowProgressText}>{progress}%</Text>
          </View>
        ) : isRead ? (
          <View style={styles.rowStatusPill}>
            <Ionicons name="checkmark-circle" size={11} color={c.teal} />
            <Text style={styles.rowStatusFinished}>Finished</Text>
          </View>
        ) : isDnf ? (
          <View style={styles.rowStatusPill}>
            <Ionicons name="close-circle" size={11} color={c.danger} />
            <Text style={styles.rowStatusDnf}>Did not finish</Text>
          </View>
        ) : null}
      </View>

      {/* Get button — hide if already reading or finished */}
      {!isReading && !isRead && (
        <Pressable accessibilityRole="button" style={styles.rowGetBtn} onPress={onBuy} hitSlop={8}>
          <Ionicons name="cart-outline" size={13} color={c.teal} />
          <Text style={styles.rowGetText}>Get</Text>
        </Pressable>
      )}

      {/* 3-dot menu */}
      <Pressable
        style={styles.rowMenuBtn}
        onPress={onMenu}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t("a11y.moreFor", { title: book.title })}
      >
        <Ionicons name="ellipsis-vertical" size={18} color={c.muted} />
      </Pressable>
    </Pressable>
  );
}

function createStyles(c: AppColors, isDark: boolean) {
  const activeControlBackground = isDark ? "rgba(20,184,166,0.16)" : c.navy;
  const activeControlBorder = isDark ? "rgba(20,184,166,0.34)" : c.navy;
  const activeControlText = isDark ? c.ink : "#FFFFFF";

  return StyleSheet.create({
    headerRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing.md
    },
    headerText: {
      flex: 1,
      paddingRight: spacing.sm
    },
    eyebrow: {
      color: c.tealDark,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1.3,
      textTransform: "uppercase"
    },
    title: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 26,
      fontWeight: "900",
      marginTop: 2
    },
    subtitle: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 6
    }, // kept for i18n references, not rendered
    miniStats: {
      alignItems: "flex-end",
      flexDirection: "row",
      gap: spacing.md,
      paddingTop: 4
    },
    miniStat: {
      alignItems: "center"
    },
    miniStatVal: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 20,
      fontWeight: "900"
    },
    miniStatLbl: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 10,
      fontWeight: "800",
      textTransform: "uppercase"
    },
    listsRail: {
      marginBottom: spacing.sm,
      marginTop: spacing.xs
    },
    listsRailContent: {
      gap: spacing.xs,
      paddingRight: spacing.sm,
      alignItems: "center"
    },
    listPill: {
      alignItems: "center",
      borderColor: c.border,
      borderRadius: radii.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 5,
      paddingHorizontal: 14,
      paddingVertical: 7
    },
    listPillActive: {
      backgroundColor: c.navy,
      borderColor: c.navy
    },
    listPillEmoji: {
      fontSize: 13
    },
    listPillText: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: "800"
    },
    listPillTextActive: {
      color: "#FFFFFF"
    },
    listPillNew: {
      alignItems: "center",
      borderColor: c.teal + "60",
      borderRadius: radii.pill,
      borderStyle: "dashed",
      borderWidth: 1,
      height: 32,
      justifyContent: "center",
      width: 32
    },
    searchRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.xs,
      marginBottom: spacing.xs
    },
    search: {
      ...shadows.card,
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: radii.pill,
      borderWidth: 1,
      color: c.ink,
      flex: 1,
      fontFamily: fonts.body,
      fontSize: 14,
      fontWeight: "700",
      paddingHorizontal: spacing.md,
      paddingVertical: 12
    },
    controlBtn: {
      alignItems: "center",
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: radii.pill,
      borderWidth: 1,
      height: 44,
      justifyContent: "center",
      width: 44
    },
    controlBtnActive: {
      backgroundColor: activeControlBackground,
      borderColor: activeControlBorder
    },
    sortPanel: {
      ...shadows.card,
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: radii.md,
      borderWidth: 1,
      marginBottom: spacing.sm,
      padding: spacing.md
    },
    sortPanelLabel: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1,
      marginBottom: spacing.sm,
      textTransform: "uppercase"
    },
    sortPanelOptions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs
    },
    sortOption: {
      alignItems: "center",
      borderColor: c.border,
      borderRadius: radii.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 5,
      minHeight: 44,
      paddingHorizontal: spacing.sm,
      paddingVertical: 7,
      justifyContent: "center",
    },
    sortOptionActive: {
      backgroundColor: activeControlBackground,
      borderColor: activeControlBorder
    },
    sortOptionText: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: "800"
    },
    sortOptionTextActive: {
      color: activeControlText
    },
    advancedChipRow: {
      flexDirection: "row",
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xs
    },
    advancedChip: {
      borderColor: c.border,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 6
    },
    advancedChipActive: {
      backgroundColor: c.tealDark,
      borderColor: c.tealDark
    },
    advancedChipText: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: "800"
    },
    advancedChipTextActive: {
      color: "#FFFFFF"
    },
    chipRail: {
      marginTop: spacing.md,
    },
    chipRailContent: {
      gap: spacing.sm,
      paddingBottom: spacing.xs,
    },
    simpleTab: {
      borderColor: c.border,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: 9,
    },
    simpleTabActive: {
      backgroundColor: c.gold,
      borderColor: c.gold,
    },
    simpleTabText: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "700",
    },
    simpleTabTextActive: {
      color: "#0F172A",
    },
    /** FlatList content padding — mirrors what <Screen scroll> applies itself. */
    listContent: {
      paddingBottom: 124,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
    },
    /** One row of the 3-column grid. Replaces the old flexWrap container. */
    gridRow: {
      justifyContent: "space-between",
      marginBottom: spacing.lg,
    },
    bookTile: {
      width: "30.5%",
    },
    tileCoverWrap: {
      aspectRatio: 2 / 3,
      backgroundColor: "#111827",
      borderRadius: 10,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
      width: "100%",
    },
    tileCoverImg: {
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    tileCoverFallback: {
      alignItems: "flex-start",
      backgroundColor: c.surfaceAlt,
      justifyContent: "flex-end",
      padding: 12,
    },
    tileCoverFallbackTitle: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 14,
      fontWeight: "900",
      lineHeight: 18,
    },
    tileCoverFallbackAuthor: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 11,
      marginTop: 4,
    },
    bookTitle: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "800",
      lineHeight: 18,
      marginTop: 10,
    },
    bookAuthor: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 12,
      lineHeight: 16,
      marginTop: 2,
    },
    bookSeries: {
      color: c.tealDark,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "700",
      lineHeight: 15,
      marginTop: 3,
    },
    rowCard: {
      alignItems: "center",
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: 14,
      paddingVertical: 14,
    },
    rowCover: {
      borderRadius: 10,
      height: 76,
      width: 52,   // portrait ratio
    },
    rowCopy: {
      flex: 1,
      gap: 2,
    },
    rowTitleRow: {
      flexDirection: "row",
      alignItems: "flex-start",
    },
    rowTitle: {
      color: c.ink,
      flex: 1,
      fontFamily: fonts.body,
      fontSize: 15,
      fontWeight: "800",
      lineHeight: 20,
    },
    rowAuthor: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 13,
      lineHeight: 18,
    },
    rowSeries: {
      color: c.tealDark,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: "700",
      marginTop: 1,
    },
    rowProgressWrap: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
      marginTop: 5,
    },
    rowProgressTrack: {
      backgroundColor: c.border,
      borderRadius: 2,
      flex: 1,
      height: 2,
      overflow: "hidden",
    },
    rowProgressFill: {
      backgroundColor: c.gold,
      borderRadius: 2,
      height: 2,
    },
    rowProgressText: {
      color: c.gold,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "800",
    },
    rowStatusPill: {
      alignItems: "center",
      flexDirection: "row",
      gap: 4,
      marginTop: 4,
    },
    rowStatusFinished: {
      color: c.teal,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: "700",
    },
    rowStatusDnf: {
      color: c.danger,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: "700",
    },
    rowGetBtn: {
      alignItems: "center",
      borderColor: c.teal + "60",
      borderRadius: radii.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 3,
      justifyContent: "center",
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    rowGetText: {
      color: c.teal,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "800",
    },
    rowMenuBtn: {
      alignItems: "center",
      justifyContent: "center",
      height: 44,
      width: 36,
    },
    // Grid tile: cover wrapper + 3-dot overlay
    tileCoverContainer: {
      position: "relative",
    },
    tileMenuBtn: {
      position: "absolute",
      top: 6,
      right: 6,
      backgroundColor: "rgba(0,0,0,0.45)",
      borderRadius: 999,
      height: 26,
      width: 26,
      alignItems: "center",
      justifyContent: "center",
    },
    // Same dim as BookCover.mutedOverlay — grid & list must match
    tileMutedOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(94,89,82,0.52)",
    },
    tileFormatBadge: {
      bottom: 6,
      left: 6,
    },
    // Filter badge on the filter button
    filterBadge: {
      position: "absolute",
      top: -4,
      right: -4,
      backgroundColor: c.coral,
      borderRadius: 999,
      height: 16,
      width: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    filterBadgeText: {
      color: "#fff",
      fontFamily: fonts.body,
      fontSize: 9,
      fontWeight: "900",
    },
    emptyState: {
      alignItems: "center",
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderStyle: "dashed",
      borderWidth: 1,
      gap: spacing.xs,
      marginTop: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 52
    },
    emptyTitle: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 20,
      fontWeight: "900",
      marginTop: spacing.xs,
      textAlign: "center"
    },
    emptySub: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 13,
      textAlign: "center"
    },
    emptyButton: {
      backgroundColor: isDark ? "rgba(20,184,166,0.16)" : c.navy,
      borderColor: isDark ? "rgba(20,184,166,0.34)" : c.navy,
      borderWidth: 1,
      borderRadius: radii.pill,
      marginTop: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: 12
    },
    emptyButtonText: {
      color: activeControlText,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "900"
    },

    // ── No-match illustrated state ──
    noMatchWrap: {
      alignItems: "center",
      marginTop: spacing.xl,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl
    },
    noMatchIconWrap: {
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.lg
    },
    noMatchRingOuter: {
      alignItems: "center",
      backgroundColor: c.navy + "18",
      borderColor: c.teal + "30",
      borderRadius: 80,
      borderWidth: 1.5,
      height: 160,
      justifyContent: "center",
      width: 160
    },
    noMatchRingInner: {
      alignItems: "center",
      backgroundColor: c.navy,
      borderRadius: 60,
      height: 120,
      justifyContent: "center",
      width: 120
    },
    noMatchIcon: {
      height: 72,
      opacity: 0.55,
      width: 72
    },
    noMatchBadge: {
      alignItems: "center",
      backgroundColor: c.coral,
      borderColor: c.surface,
      borderRadius: 16,
      borderWidth: 2.5,
      bottom: 4,
      height: 32,
      justifyContent: "center",
      position: "absolute",
      right: 4,
      width: 32
    },
    noMatchTitle: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 22,
      fontWeight: "900",
      marginBottom: spacing.xs,
      textAlign: "center"
    },
    noMatchSub: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: spacing.lg,
      textAlign: "center"
    },
    noMatchClearBtn: {
      alignItems: "center",
      borderColor: c.teal,
      borderRadius: radii.pill,
      borderWidth: 1.5,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: spacing.lg,
      paddingVertical: 12
    },
    noMatchClearText: {
      color: c.teal,
      fontFamily: fonts.body,
      fontSize: 14,
      fontWeight: "900"
    }
  });
}
