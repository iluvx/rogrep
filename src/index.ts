import { mount } from "svelte";
import App, { css } from "./App.svelte";
import { getPanel } from "./vm.ts";

const panel = getPanel({
  theme: "dark",
  style: css,
});
Object.assign(panel.wrapper.style, {
  top: "80px",
  right: "20px",
  zIndex: "99999",
});
panel.setMovable(true);

const launcher = document.createElement("button");
launcher.textContent = "rogrep";
Object.assign(launcher.style, {
  position: "fixed",
  bottom: "20px",
  right: "20px",
  zIndex: "99999",
  padding: "10px 16px",
  borderRadius: "9999px",
  border: "none",
  background: "#335fff",
  color: "#fff",
  fontWeight: "600",
  cursor: "pointer",
  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
});

let visible = false;
const toggle = () => {
  visible = !visible;
  if (visible) panel.show();
  else panel.hide();
};
launcher.addEventListener("click", toggle);
document.body.appendChild(launcher);

mount(App, { target: panel.body });
