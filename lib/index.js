'use strict';

const Boom = require('boom');
const Graphql = require('graphql');
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

  const resolvers = internals.wrapResolvers(options.resolvers || {});
  server.bind({ schema, resolvers, settings });

  const tags = ['graphql'];
  server.route({
    method: ['GET', 'POST'],
    path: settings.graphqlPath,
    config: {
      tags,
      handler: internals.graphqlHandler
    }
  });


  if (settings.graphiqlPath) {
    server.route({
      method: 'GET',
      path: settings.graphiqlPath,
      config: {
        tags,
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
  const source = request.method.toUpperCase() === 'GET' ? request.query : request.payload;

  const operationName = source.operationName;
  const variables = internals.tryParseVariables(source.variables);
  if (variables && variables.isBoom) {
    return reply(variables);
  }

  let queryAST;
  try {
    queryAST = Graphql.parse(source.query);
  } catch (err) {
    return reply(Boom.badRequest('invalid GraqhQL request', err));
  }

  reply(Graphql.execute(this.schema, queryAST, this.resolvers, request, variables, operationName)).type('application/json');
};


internals.tryParseVariables = function (input) {
  if (!input || typeof input !== 'string') {
    return input;
  }

  try {
    return JSON.parse(input);
  } catch (error) {
    return Boom.badRequest('Unable to JSON.parse variables', error);
  }
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


internals.wrapResolvers = function (resolvers) {
  const wrapped = {};
  const keys = Object.keys(resolvers);
  for (let i = 0; i < keys.length; ++i) {
    const key = keys[i];
    const resolver = resolvers[key];
    wrapped[key] = internals.wrapResolver(resolver);
  }

  return wrapped;
};

internals.wrapResolver = function (resolver) {
  return function (args, request) {
    return new Promise((resolve, reject) => {
      const isPromise = resolver(args, request, (err, ...results) => {
        if (err) {
          return reject(err);
        }

        resolve(...results);
      });

      if (isPromise instanceof Promise) {
        isPromise.then(resolve).catch(reject);
      }
    });
  };
};
