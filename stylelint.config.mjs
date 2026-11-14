// The @lhak/style adoption check: no raw colours, px font sizes or retired
// prefixes. Only adopted CSS is linted: the `lint:css` script lists those files,
// and each file the adoption work migrates joins that list.
export default { extends: ['@lhak/style/stylelint'] };
