// webpack.config.js
//@ts-check // Enables type checking for this file in VS Code if you have JSDoc comments

'use strict';

const path = require('path');
/** @type {import('webpack').Configuration} */

const config = {
   target: 'node',
   mode: 'none',
   entry: './src/extension.ts',
   output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
   },
   devtool: 'nosources-source-map', 
   externals: {
    vscode: 'commomjs vscode' // Put more dir you don't want webpack ro bundle here
   },
   resolve: {
    extensions: ['.ts', '.js']
   },
   module: {
     rules: [
     { 
      test: /\.ts$/,
      exclude: /node_modules/,
      use: [
        {
          loader: 'ts-loader'
        }
      ]
    }
    // Add more rules here
     ]
   }
};

module.exports = config; // Exports the configuration object for Webpack to use