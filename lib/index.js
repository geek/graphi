'use strict';

const Graphql = require('graphql');
const GraphqlCore = require('graphql-server-core');
const Package = require('../package.json');


const internals = {};


module.exports = function (server, options, next) {
  const schema = (typeof options.schema === 'string') ? Graphql.buildSchema(options.schema) : options.schema;

  server.bind({ schema, functions: options.functions });

  server.route({
    method: ['GET', 'POST'],
    path: options.path || '/graphql',
    handler: internals.handler
  });

  next();
};


module.exports.attributes = {
  pkg: Package
};


internals.handler = function (request, reply) {
  const method = request.method.toUpperCase();
  const query = method === 'POST' ? request.payload : request.query;
  const options = {
    rootValue: this.functions,
    schema: this.schema,
    context: request
  };

  reply(GraphqlCore.runHttpQuery([], {
    method,
    options,
    query
  })).type('application/json');
};
