// Verificação do código (não vai para o ZIP). Uso: npx eslint scripts/
// Globais do Foundry e do navegador que os scripts usam.
const foundryGlobals = Object.fromEntries([
  "game", "ui", "Hooks", "CONFIG", "foundry", "canvas", "ChatMessage", "Actor", "Item", "ActiveEffect", "Roll", "fromUuid",
  "fromUuidSync", "TextEditor", "Dialog", "FormDataExtended", "renderTemplate", "CONST", "Token", "TokenDocument"
].map(k => [k, "readonly"]));
const browserGlobals = Object.fromEntries([
  "window", "document", "console", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame",
  "cancelAnimationFrame", "HTMLElement", "Element", "Node", "Event", "KeyboardEvent", "MouseEvent", "PointerEvent", "FileReader",
  "Blob", "URL", "fetch", "navigator", "sessionStorage", "localStorage", "getComputedStyle", "DOMParser", "structuredClone",
  "AbortController", "Image", "Audio", "ResizeObserver", "MutationObserver", "performance", "location", "alert", "confirm",
  "HTMLInputElement", "HTMLSelectElement", "HTMLTextAreaElement", "SVGElement", "DataTransfer", "File", "Intl", "queueMicrotask",
  "crypto", "TextEncoder", "TextDecoder", "atob", "btoa", "matchMedia", "CSS", "WeakRef"
].map(k => [k, "readonly"]));
export default [{
  files: ["scripts/**/*.js"],
  languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...foundryGlobals, ...browserGlobals } },
  rules: {
    "no-unused-vars": ["error", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }],
    "no-undef": "error",
    "no-import-assign": "error",
    "no-dupe-keys": "error",
    "no-unreachable": "error"
  }
}];
