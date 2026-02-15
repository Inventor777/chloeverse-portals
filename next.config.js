const path = require('path')

/** @type {import('next').NextConfig} */
module.exports = {
  // This can silence the "inferred your workspace root" warning if you have other lockfiles elsewhere.
  turbopack: {
    root: path.join(__dirname),
  },
}
