const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  
  return {
    entry: './src/index.js',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: isProduction ? 'knew-cleus-ads.min.js' : 'knew-cleus-ads.js',
      library: 'KnewCleusAds',
      libraryTarget: 'umd',
      libraryExport: 'default',
      globalObject: 'this',
      clean: true
    },
    module: {
      rules: [
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader']
        }
      ]
    },
    optimization: {
      minimize: isProduction,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            compress: {
              drop_console: isProduction,
              drop_debugger: isProduction
            },
            mangle: true
          },
          extractComments: false
        })
      ]
    },
    devtool: isProduction ? false : 'source-map',
    mode: argv.mode || 'development',
    target: 'web'
  };
};
