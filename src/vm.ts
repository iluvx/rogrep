type VMGlobal = Pick<
  typeof import("@violentmonkey/ui"),
  "getPanel" | "showToast"
>;

const vm = (globalThis as typeof globalThis & { VM: VMGlobal }).VM;

export const getPanel: VMGlobal["getPanel"] = (...args) => vm.getPanel(...args);
export const showToast: VMGlobal["showToast"] = (...args) =>
  vm.showToast(...args);
