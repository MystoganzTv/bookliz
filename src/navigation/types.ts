export type RootStackParamList = {
  OnboardingWelcome: undefined;
  OnboardingName: undefined;
  OnboardingGenres: { name: string };
  Welcome: undefined;
  AppTabs: undefined;
  BookDetail: { bookId: string };
  ReadingLog: { bookId?: string };
  /** The audiobook player. `autoplay` false opens it paused (right after attaching a file). */
  AudioPlayer: { bookId: string; autoplay?: boolean };
  AddReadingSession: { bookId?: string; sessionId?: string; prefillMinutes?: number; prefillStartedAt?: number };
  BookIntake:
    | {
        autoRun?: boolean;
        initialMode?: "search";
        initialQuery?: string;
        initialSearchIntent?: "auto" | "author" | "series";
        initialBookSelection?: {
          title: string;
          authorName: string;
          coAuthorNames?: string[];
          isbn?: string;
          pages?: number;
          genre?: string[];
          publishedDate?: string;
          language?: string;
          synopsis?: string;
          coverImageUri?: string;
          /** Which shelf the reader picked before the book was even staged. */
          shelf?: "library" | "wishlist";
        };
      }
    | undefined;
  Stats: undefined;
  SeriesTracker: { seriesId: string };
  EditProfile: undefined;
  Settings: undefined;
  /** A multi-choice setting on its own screen (BookPlayer-style). */
  SettingsChoice: { setting: "language" | "theme" | "skipBack" | "skipForward" | "keepAwake" };
  /** Settings > Player controls. */
  PlayerSettings: undefined;
  /** Settings > Storage > Manage files. */
  ManageAudio: undefined;
  EditBook: { bookId: string };
  Achievements: undefined;
  WriteReview: { bookId: string };
  GenreBrowse: {
    genre: string;
    /** Optional display title override (e.g. "Funny Books") */
    title?: string;
    /** If provided, does a keyword search instead of subject search */
    catalogQuery?: string;
    /** Optional editorial seed titles to prioritize first */
    curatedTitles?: Array<{ title: string; author?: string }>;
    /**
     * "newest" asks the catalogue for the most recent titles first. Moods use
     * it: someone browsing for a feeling wants what is out now, not the same
     * canon every time. Genres keep relevance, where the classics belong.
     */
    sort?: "relevance" | "newest";
  };
  AuthorBooks: {
    /** Library author id when known; catalog-only authors navigate by name alone. */
    authorId?: string;
    authorName: string;
  };
  /** In-app legal documents. */
  Legal: { doc: "privacy" | "terms" };
  /** Rich preview for a catalog book (not yet in the library). */
  BookPreview: {
    book: {
      title: string;
      authors: string[];
      isbn13?: string;
      coverUrl?: string;
      publishedYear?: number;
      pageCount?: number;
      description?: string;
      genres?: string[];
      language?: string;
      averageRating?: number;
      ratingsCount?: number;
    };
  };
};

export type MainTabParamList = {
  Home: undefined;
  Library: undefined;
  Add: undefined;
  Discover: undefined;
  Profile: undefined;
};
