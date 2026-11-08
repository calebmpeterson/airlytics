const fs = require('fs');
const path = require('path');
const nodeExternals = require('webpack-node-externals');
const source = path.join(__dirname, 'functions');
module.exports = fs.readdirSync(source).filter(name => name.endsWith('.js')).map(name => ({
  name, entry: path.join(source, name), mode: 'production', target: 'node24', devtool: false,
  externals: [nodeExternals()],
  output: { path: path.join(__dirname, 'build', path.basename(name, '.js')), filename: name, library: { type: 'commonjs2' } },
}));
