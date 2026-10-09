const path = require('path');

// Builds the /v2/ client into nbviewer/static/v2, which nbviewer serves
// as static files. Asset rules follow JupyterLab's own bundler setup.
module.exports = (env, argv) => ({
  entry: './src/index.ts',
  output: {
    path: path.resolve(__dirname, '..', 'nbviewer', 'static', 'v2'),
    filename: 'nbviewer-v2.js',
    chunkFilename: '[name].[contenthash].js',
    assetModuleFilename: 'assets/[name].[contenthash][ext]',
    // Resolve chunk URLs relative to the main script, wherever it is served.
    publicPath: 'auto',
    clean: true
  },
  devtool: argv.mode === 'development' ? 'source-map' : false,
  resolve: {
    extensions: ['.ts', '.js'],
    fallback: { path: false, url: false, crypto: false, buffer: false }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        loader: 'builtin:swc-loader',
        options: { jsc: { parser: { syntax: 'typescript' } } },
        type: 'javascript/auto'
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
        type: 'javascript/auto'
      },
      { test: /\.(html|md)$/, type: 'asset/source' },
      { test: /\.(png|jpe?g|gif|woff2?|ttf|otf|eot)$/, type: 'asset/resource' },
      // JupyterLab imports SVG icons as strings from JS, and as URLs from CSS.
      { test: /\.svg$/, issuer: /\.[jt]s$/, type: 'asset/source' },
      { test: /\.svg$/, issuer: /\.css$/, type: 'asset/inline' }
    ]
  },
  // mathjax-full's component loader references __dirname; it is unused in
  // the browser, where JupyterLab's typesetter imports modules directly.
  ignoreWarnings: [{ module: /mathjax-full/, message: /__dirname/ }],
  performance: { hints: false }
});
