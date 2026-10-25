import { addFavorites, cleanFavorites, favoriteSuggestions, removeFavorite } from "../favorites";

describe("favorites", () => {
  it("cleans, dedupes ignoring case and accents, keeps the first spelling", () => {
    expect(cleanFavorites([" Tolkien ", "tolkien", "", "García Márquez", "Garcia Marquez"])).toEqual([
      "Tolkien",
      "García Márquez",
    ]);
  });
  it("adds pasted lists and removes", () => {
    const list = addFavorites(["Fantasy"], "Horror, fantasy ,  Romance");
    expect(list).toEqual(["Fantasy", "Horror", "Romance"]);
    expect(removeFavorite(list, "horror")).toEqual(["Fantasy", "Romance"]);
    expect(removeFavorite(["Only"], "Only")).toEqual([]); // the list can be emptied
  });
  it("suggests the most frequent first, skipping chosen ones", () => {
    expect(favoriteSuggestions(["Sanderson", "King", "Sanderson", "Austen", "king"], ["Austen"], 5)).toEqual([
      "Sanderson",
      "King",
    ]);
  });
});
