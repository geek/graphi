'use strict';

const Boom = require('boom');
const Graphql = require('graphql');
const GraphqlCore = require('graphql-server-core');
const Graphiql = require('graphql-server-module-graphiql');
const Package = require('../package.json');


const internals = {
  defaults: {
    graphqlPath: '/graphql',
    graphiqlPath: '/graphiql'
  }
};


module.exports = function (server, options, next) {
  const schema = (typeof options.schema === 'string') ? Graphql.buildSchema(options.schema) : options.schema;
  const settings = Object.assign({}, internals.defaults, options);

  server.bind({ schema, resolvers: options.resolvers, settings });

  server.route({
    method: ['GET', 'POST'],
    path: settings.graphqlPath,
    config: {
      tags: ['graphql'],
      handler: internals.graphqlHandler
    }
  });

  if (settings.graphiqlPath) {
    server.route({
      method: 'GET',
      path: settings.graphiqlPath,
      config: {
        tags: ['graphiql'],
        handler: internals.graphiqlHandler
      }
    });
  }

  next();
};


module.exports.attributes = {
  pkg: Package
};


internals.graphqlHandler = function (request, reply) {
  const method = request.method.toUpperCase();
  const query = method === 'POST' ? request.payload : request.query;
  const options = {
    rootValue: this.resolvers,
    schema: this.schema,
    context: request
  };

  GraphqlCore.runHttpQuery([request, reply], {
    method,
    options,
    query
  }).then((result) => {
    reply(result).type('application/json');
  }).catch((err) => {
    if (err.statusCode) {
      return reply(Boom.create(err.statusCode, err.message, err));
    }

    reply(Boom.internal(err));
  });
};


internals.graphiqlHandler = function (request, reply) {
  const query = request.query;
  const variables = query.variables || '{}';
  const prefix = request.route.realm.modifiers.route.prefix || '';

  reply(Graphiql.renderGraphiQL({
    endpointURL: prefix + this.settings.graphqlPath,
    query: query.query,
    variables: JSON.parse(variables),
    operationName: query.operationName
  }));
};

