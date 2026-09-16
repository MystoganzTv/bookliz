import { displayTitle, isSentenceCase, toEnglishTitleCase } from "../utils/titleCase";

const BALDACCI = ["Nash Falls", "Redemption", "End Game", "Wish You Well", "Stone Cold", "The Escape", "Memory Man"];

describe("titleCase", () => {
  it("title-cases catalogue sentence case when the author's other titles are title case", () => {
    expect(displayTitle("The forgotten", BALDACCI)).toBe("The Forgotten");
    expect(displayTitle("Total control", BALDACCI)).toBe("Total Control");
    expect(displayTitle("Long road to mercy", BALDACCI)).toBe("Long Road to Mercy");
    expect(displayTitle("No man's land", BALDACCI)).toBe("No Man's Land");
  });

  it("leaves Spanish sentence case alone", () => {
    const pierceBrownEs = ["Hijo dorado", "Mañana azul", "Edad oscura"];
    expect(displayTitle("Amanecer rojo", pierceBrownEs)).toBe("Amanecer rojo");
    expect(displayTitle("Alas de ónix", [])).toBe("Alas de ónix");
    expect(displayTitle("La sombra del viento", [])).toBe("La sombra del viento");
  });

  it("uses English function words as evidence when there are no siblings", () => {
    expect(displayTitle("Deliver us from evil", [])).toBe("Deliver Us from Evil");
    expect(displayTitle("First family", [])).toBe("First family");
  });

  it("does not touch titles someone already cased", () => {
    expect(isSentenceCase("The Forgotten")).toBe(false);
    expect(isSentenceCase("iPhone for dummies")).toBe(false);
    expect(isSentenceCase("Dune")).toBe(false);
    expect(displayTitle("The 6:20 Man", BALDACCI)).toBe("The 6:20 Man");
  });

  it("keeps small words lower-case except first and last", () => {
    expect(toEnglishTitleCase("the lord of the rings")).toBe("The Lord of the Rings");
    expect(toEnglishTitleCase("what we talk about")).toBe("What We Talk About");
  });
});
