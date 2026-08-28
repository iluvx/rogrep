import { expect, test } from "bun:test";

test("production userscript is a Violentmonkey file with Svelte UI", async () => {
  const text = await Bun.file("dist/rogrep.user.js").text();
  expect(text.startsWith("// ==UserScript==")).toBe(true);
  expect(text).toContain("@match       *://*.roblox.com/games/*");
  expect(text).toContain("globalThis.VM");
  expect(text).toContain("rogrep — find a user in a server");
  expect(text).toContain("(()=>{");
});
