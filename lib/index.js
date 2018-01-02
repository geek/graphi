'use strict';

const Boom = require('boom');
const Graphql = require('graphql');
const Graphiql = require('graphql-server-module-graphiql');
const Package = require('../package.json');


const internals = {
  defaults: {
    graphqlPath: '/graphql',
    graphiqlPath: '/graphiql',
    authStrategy: false
  }
};


exports.register = function (server, options) {
  const settings = Object.assign({}, internals.defaults, options);

  let schema = options.schema;
  let resolvers;

  if (schema && typeof schema === 'string') {
    options.schema += 'scalar JoiString';
    const parsed = Graphql.parse(options.schema);
    schema = Graphql.buildASTSchema(parsed);
    resolvers = options.resolvers;
  }

  server.bind({ schema, resolvers, settings });

  const tags = ['graphql'];

  const route = {
    method: '*',
    path: settings.graphqlPath,
    config: {
      tags,
      auth: settings.authStrategy,
      handler: internals.graphqlHandler
    }
  };

  server.route(route);

  if (settings.graphiqlPath) {
    server.route({
      method: '*',
      path: settings.graphiqlPath,
      config: {
        tags,
        auth: false,
        handler: internals.graphiqlHandler
      }
    });
  }
};

exports.pkg = Package;


internals.graphqlHandler = async function (request, h) {
  if (request.method.toUpperCase() === 'OPTIONS') {
    return h.continue;
  }
  const source = request.method.toUpperCase() === 'GET' ? request.query : (request.payload || {});

  const operationName = source.operationName;
  const variables = internals.tryParseVariables(source.variables);
  if (variables && variables.isBoom) {
    return variables;
  }

  let queryAST;
  try {
    queryAST = Graphql.parse(source.query);
  } catch (err) {
    return Boom.badRequest('invalid GraqhQL request', err);
  }

  const errors = Graphql.validate(this.schema, queryAST);
  if (errors.length) {
    return Boom.badRequest(errors.join(', '));
  }

  const result = await Graphql.execute(this.schema, queryAST, this.resolvers, request, variables, operationName);
  if (result.errors) {
    request.log(['error', 'graqhql-error'], result);
  }

  return result;
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


internals.graphiqlHandler = function (request, h) {
  const query = request.query;
  const variables = query.variables || '{}';
  const prefix = request.route.realm.modifiers.route.prefix || '';

  return Graphiql.renderGraphiQL({
    endpointURL: prefix + this.settings.graphqlPath,
    query: query.query,
    variables: JSON.parse(variables),
    operationName: query.operationName
  });
};
