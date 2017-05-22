'use strict';


const Package = require('../package.json');


module.exports = function (server, options, next) {
  next();
};


module.exports.attributes = {
  pkg: Package
};
