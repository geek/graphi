'use strict';

const Boom = require('boom');
const Graphql = require('graphql');
const Graphiql = require('graphql-server-module-graphiql');
const Merge = require('lodash.merge');
const Utils = require('./utils');
const Package = require('../package.json');


const internals = {
  defaults: {
    graphqlPath: '/graphql',
    graphiqlPath: '/graphiql',
    authStrategy: false,
    graphiAuthStrategy: false
  }
};


exports.register = function (server, options) {
  const settings = Merge({}, internals.defaults, options);

  server.expose('resolvers', {});
  server.expose('settings', settings);
  server.expose('publish', Utils.publish(server));
  server.decorate('server', 'makeExecutableSchema', Utils.makeExecutableSchema);
  server.decorate('server', 'registerSchema', internals.registerSchema);

  if (settings.schema) {
    server.registerSchema({ schema: settings.schema, resolvers: settings.resolvers });
  }

  server.ext({
    type: 'onPreStart',
    method: internals.onPreStart
  });

  server.route({
    method: '*',
    path: settings.graphqlPath,
    config: {
      auth: settings.authStrategy,
      handler: internals.graphqlHandler
    }
  });

  if (settings.graphiqlPath) {
    server.route({
      method: '*',
      path: settings.graphiqlPath,
      config: {
        auth: settings.graphiAuthStrategy,
        handler: internals.graphiqlHandler
      }
    });
  }
};

exports.pkg = Package;

exports.graphql = Graphql;

exports.makeExecutableSchema = Utils.makeExecutableSchema;

internals.registerSchema = function ({ schema = {}, resolvers = {} }) {
  const server = this;
  if (typeof schema === 'string') {
    schema = Utils.makeExecutableSchema({ schema, resolvers });
  }

  if (schema._subscriptionType) {
    server.dependency('nes');
    Utils.registerSubscriptions(server, schema);
  }

  server.plugins.graphi.resolvers = Merge(server.plugins.graphi.resolvers, resolvers);
  server.plugins.graphi.schema = Utils.mergeSchemas(server.plugins.graphi.schema, schema);
};

internals.onPreStart = function (server) {
  const resolver = ({ prefix = '', method = 'graphql' }) => {
    return async (payload, request, ast) => {
      const url = `${prefix}/${ast.fieldName}`;
      const res = await request.server.inject({
        method,
        url,
        payload,
        headers: request.headers
      });

      if (res.statusCode < 400) {
        return res.result;
      }

      return new Boom(res.result.message, {
        statusCode: res.statusCode,
        data: {
          error: res.result.error,
          url
        }
      });
    };
  };

  server.table().forEach((route) => {
    const tags = route.settings.tags || [];
    if (route.method !== 'graphql' && tags.indexOf('graphql') === -1) {
      return;
    }

    const prefix = route.realm.modifiers.route.prefix;
    const path = prefix ? route.path.substr(prefix.length + 1) : route.path.substr(1);
    server.plugins.graphi.resolvers[path] = resolver({ prefix, method: route.method });
  });
};

internals.graphqlHandler = async function (request, h) {
  if (request.method.toUpperCase() === 'OPTIONS') {
    return h.continue;
  }

  const parentSpan = (typeof request.span === 'function') && request.span('handler');
  let span;
  if (parentSpan && request.server.tracer) {
    span = request.server.tracer.startSpan('graphql_request', { childOf: parentSpan.context() });
    span.log({ event: 'onGraphQL', payload: request.payload, info: request.info });
  }

  const { schema, resolvers } = request.server.plugins.graphi;
  const source = request.method.toUpperCase() === 'GET' ? request.query : (request.payload || {});

  const operationName = source.operationName;
  const variables = internals.tryParseVariables(source.variables);
  if (variables && variables.isBoom) {
    if (span) {
      span.log({ event: 'error', method: 'tryParseVariables', error: variables });
      span.finish();
    }
    return variables;
  }

  let queryAST;
  try {
    queryAST = Graphql.parse(source.query);
  } catch (ex) {
    if (span) {
      span.log({ event: 'error', method: 'graphql.parse', error: ex });
      span.finish();
    }
    return Boom.badRequest(ex.toString());
  }

  const errors = Graphql.validate(schema, queryAST);
  if (errors.length) {
    if (span) {
      span.log({ event: 'error', method: 'graphql.validate', error: errors });
      span.finish();
    }
    return Boom.badRequest(errors.join(', '));
  }

  const result = await Graphql.execute(schema, queryAST, resolvers, request, variables, operationName);
  if (result.errors) {
    if (span) {
      span.log({ event: 'error', method: 'graphql.execute', error: result.errors });
      span.finish();
    }
    request.log(['error', 'graqhql-error'], result);
  }

  if (span) {
    span.finish();
  }

  return result;
};

internals.graphiqlHandler = function (request, h) {
  const { settings } = request.server.plugins.graphi;
  const query = request.query;
  const variables = query.variables || '{}';
  const prefix = request.route.realm.modifiers.route.prefix || '';

  return Graphiql.renderGraphiQL({
    endpointURL: prefix + settings.graphqlPath,
    query: query.query,
    variables: JSON.parse(variables),
    operationName: query.operationName
  });
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
