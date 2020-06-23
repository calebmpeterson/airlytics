const fs = require("fs");
const path = require("path");
const webpack = require("webpack");
const ProgressBarPlugin = require("progress-bar-webpack-plugin");
const nodeExternals = require("webpack-node-externals");

const SRC_DIR = path.join(__dirname, "functions");

console.log(`CWD: `, process.cwd(), __dirname);
console.log(`ENV: ${process.env.NODE_ENV}`);

const entryPoints = fs
  .readdirSync(SRC_DIR)
  .filter((filename) => filename.endsWith(".js"));

module.exports = entryPoints.map((entryPoint) => {
  const entry = `${SRC_DIR}/${entryPoint}`;
  console.log(`Entry Point: ${entryPoint}`);
  console.log(`  entry: ${entry}`);

  return {
    name: entryPoint,
    entry,
    mode: "development",
    target: "node",
    devtool: false,
    node: {
      global: false,
      __filename: false,
      __dirname: false,
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          use: {
            loader: "babel-loader",
            options: {
              presets: ["@babel/preset-env"],
            },
          },
        },
      ],
    },
    externals: [
      nodeExternals(),
      nodeExternals({
        modulesDir: path.resolve(__dirname, "./node_modules"),
      }),
    ],
    output: {
      path: path.join(__dirname, "build", path.basename(entryPoint, ".js")),
      filename: entryPoint,
      libraryTarget: "commonjs2",
    },
    plugins: [
      new ProgressBarPlugin(),
      new webpack.DefinePlugin({
        NODE_ENV: process.env.NODE_ENV,
      }),
    ],
  };
});
