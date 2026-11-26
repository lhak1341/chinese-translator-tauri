// The @lhak/style adoption check: no raw colours, px font sizes or retired
// prefixes. `lint:css` passes every stylesheet under src (adoption ticket 17).
export default {
  extends: ['@lhak/style/stylelint'],
  rules: {
    // Dark mode is <html data-mode="dark">, written by the ThemeProvider from the user's pick;
    // a media query follows the system only (src/styles/CLAUDE.md).
    'media-feature-name-disallowed-list': [
      ['prefers-color-scheme'],
      { message: 'Use :root[data-mode="dark"], not prefers-color-scheme' },
    ],
  },
};
