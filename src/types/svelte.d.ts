declare module "*.svelte" {
  import type { Component } from "svelte";

  export const css: string;
  const component: Component;
  export default component;
}
