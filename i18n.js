// Simple i18n helper for Habitica MCP Server
// Currently only English is supported. The translation mechanism is kept
// for future language additions.
const DEFAULT_LANG = 'en';
let currentLang = DEFAULT_LANG;

export function setLanguage(lang) {
  currentLang = (lang || '').toLowerCase();
}

export function getLanguage() {
  return currentLang;
}

export function t(en) {
  return en;
} 