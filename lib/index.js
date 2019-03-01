'use strict';

const Boom = require('boom');
const Graphql = require('graphql');
const Graphiql = require('apollo-server-module-graphiql');
const Merge = require('lodash.merge');
const Table = require('cli-table');
const Utils = require('./utils');
const Package = require('../package.json');


const internals = {
  defaults: {
    graphqlPath: '/graphql',
    graphiqlPath: '/graphiql',
    authStrategy: false,
    graphiAuthStrategy: false,
    formatError: null,
    tracing: false,
    tracingResult: {
      tracingResolvers: []
    }
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
  const { tracing, tracingResult } = request.server.plugins.graphi.settings;

  if (request.method.toUpperCase() === 'OPTIONS') {
    return h.continue;
  }

  const parentSpan = (typeof request.span === 'function') && request.span('handler');
  let span;
  /* $lab:coverage:off$ */
  if (parentSpan && request.server.tracer) {
  /* $lab:coverage:on$ */
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

  const result = await Graphql.execute(schema, queryAST, resolvers, request, variables, operationName, internals.fieldResolver(request));
  if (result.errors) {
    const formatError = request.server.plugins.graphi.settings.formatError;
    if (typeof formatError === 'function') {
      result.errors = result.errors.map(formatError);
    }

    if (span) {
      span.log({ event: 'error', method: 'graphql.execute', error: result.errors });
      span.finish();
    }
    request.log(['error', 'graqhql-error'], result);
  }

  if (span) {
    span.finish();
  }

  if (tracing) {
    const table = new Table({
      head: ['Field name', 'Parent Type', 'Return Type', 'Path', 'Duration (ns)', 'Duration (ms)']
    });

    tracingResult.tracingResolvers
      .sort((a, b) => {
        return a.duration - b.duration;
      })
      .forEach((tracingResolver) => {
        table.push([
          tracingResolver.fieldName,
          tracingResolver.parentType,
          tracingResolver.returnType,
          tracingResolver.path.join(' - '),
          tracingResolver.duration,
          tracingResolver.duration / 1e6
        ]);
      });

    console.log(table.toString());
    tracingResult.tracingResolvers = [];
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

internals.fieldResolver = function (request) {
  return function (value, args, ctx, info) {
    const { tracing, tracingResult } = request.server.plugins.graphi.settings;

    const tracerResult = {};
    if (tracing) {
      tracerResult.fieldName = info.fieldName;
      tracerResult.path = [...Graphql.responsePathAsArray(info.path)];
      tracerResult.parentType = info.parentType;
      tracerResult.returnType = info.returnType;
      tracerResult.startTime = internals.duration(process.hrtime());

      tracingResult.tracingResolvers.push(tracerResult);
    }

    const result = Graphql.defaultFieldResolver(value, args, ctx, info);

    if (tracing) {
      const endTime = internals.duration(process.hrtime());
      tracerResult.duration = endTime - tracerResult.startTime;
    }

    return result;
  };
};

internals.duration = function (hrtime) {
  return hrtime[0] * 1e9 + hrtime[1];
};
