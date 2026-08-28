import { expect, test } from "bun:test";
import { getPlaceIdFromUrl } from "./roblox.ts";

test("reads a numeric place id from a games url", () => {
  expect(getPlaceIdFromUrl("https://www.roblox.com/games/12345/Name")).toBe(
    "12345",
  );
});

test("returns null when the url has no place id", () => {
  expect(getPlaceIdFromUrl("https://www.roblox.com/home")).toBeNull();
});
