module.exports = {
  "*.{ts,tsx,js,jsx}": ["next lint --fix --file"],
  "*.{ts,tsx,js,jsx,json,css,md}": ["prettier --write"]
};
