import { describe, expect, it } from "vitest";
import { resolveRestaurantLinks } from "./public-links";

describe("restaurant preview links", () => {
  it("keeps the real restaurant as the default", () => {
    expect(resolveRestaurantLinks()).toEqual({
      restaurantUrl: "https://lachingada.ca/",
      menuUrl: "https://lachingada.ca/menu",
    });
  });
  it("derives the menu beside a configured preview homepage", () => {
    expect(
      resolveRestaurantLinks("https://food-preview.example/restaurant/"),
    ).toEqual({
      restaurantUrl: "https://food-preview.example/restaurant/",
      menuUrl: "https://food-preview.example/restaurant/menu",
    });
  });
  it("accepts an explicit menu preview destination", () => {
    expect(
      resolveRestaurantLinks(
        "http://127.0.0.1:7332",
        "https://food-preview.example/#menu",
      ).menuUrl,
    ).toBe("https://food-preview.example/#menu");
  });
  it("never exposes embedded credentials or unsafe schemes in a customer link", () => {
    expect(
      resolveRestaurantLinks(
        "javascript:alert(1)",
        "https://user:password@example.com/menu",
      ),
    ).toEqual({
      restaurantUrl: "https://lachingada.ca/",
      menuUrl: "https://lachingada.ca/menu",
    });
  });
});
