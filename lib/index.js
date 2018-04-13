'use strict';

const Assert = require('assert');
const Boom = require('boom');
const Graphql = require('graphql');
const Graphiql = require('graphql-server-module-graphiql');
const Merge = require('lodash.merge');
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
  const settings = Object.assign({}, internals.defaults, options);

  let schema = options.schema;
  const resolvers = Merge({}, options.resolvers);

  if (schema && typeof schema === 'string') {
    schema = exports.makeExecutableSchema({ schema, resolvers });
  }

  server.ext({
    type: 'onPreStart',
    method: () => {
      const resolver = (prefix = '') => {
        return async (payload, request, ast) => {
          const url = `${prefix}/${ast.fieldName}`;
          const res = await request.server.inject({
            method: 'graphql',
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
        if (route.method !== 'graphql') {
          return;
        }
        const prefix = route.realm.modifiers.route.prefix;
        const path = prefix ? route.path.substr(prefix.length + 1) : route.path.substr(1);
        resolvers[path] = resolver(prefix);
      });

      server.expose('resolvers', resolvers);
    }
  });

  server.expose('schema', schema);
  server.expose('settings', settings);
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
        auth: settings.graphiAuthStrategy,
        handler: internals.graphiqlHandler
      }
    });
  }
};

exports.pkg = Package;

exports.graphql = Graphql;

// Inspired by graphql-tools
exports.makeExecutableSchema = ({ schema, resolvers = {}, preResolve }) => {
  const parsed = Graphql.parse(schema);
  const astSchema = Graphql.buildASTSchema(parsed, { commentDescriptions: true });

  for (const resolverName of Object.keys(resolvers)) {
    const type = astSchema.getType(resolverName);
    if (!type) {
      continue;
    }

    const typeResolver = resolvers[resolverName];

    // go through field resolvers for the parent resolver type
    for (const fieldName of Object.keys(typeResolver)) {
      let fieldResolver = typeResolver[fieldName];
      Assert(typeof fieldResolver === 'function', `${resolverName}.${fieldName} resolver must be a function`);
      if (typeof preResolve === 'function') {
        fieldResolver = internals.wrapResolve(preResolve, fieldResolver);
      }

      if (type instanceof Graphql.GraphQLScalarType) {
        type[fieldName] = fieldResolver;
        continue;
      }

      if (type instanceof Graphql.GraphQLEnumType) {
        const fieldType = type.getValue(fieldName);
        Assert(fieldType, `${resolverName}.${fieldName} enum definition missing from schema`);
        fieldType.value = fieldResolver;
        continue;
      }

      // no need to set resolvers unless we are dealing with a type that needs resolvers
      if (!(type instanceof Graphql.GraphQLObjectType) && !(type instanceof Graphql.GraphQLInterfaceType)) {
        continue;
      }

      const fields = type.getFields();
      fields[fieldName].resolve = fieldResolver;
    }
  }
  return astSchema;
};

internals.wrapResolve = function (preResolve, resolve) {
  return (root, args, request) => {
    const context = preResolve(root, args, request);

    return resolve.call(context, root, args, request);
  };
};


internals.graphqlHandler = async function (request, h) {
  if (request.method.toUpperCase() === 'OPTIONS') {
    return h.continue;
  }

  const { schema, resolvers } = request.server.plugins.graphi;
  const source = request.method.toUpperCase() === 'GET' ? request.query : (request.payload || {});

  const operationName = source.operationName;
  const variables = internals.tryParseVariables(source.variables);
  if (variables && variables.isBoom) {
    return variables;
  }

  let queryAST;
  try {
    queryAST = Graphql.parse(source.query);
  } catch (ex) {
    return Boom.badRequest(ex.toString());
  }

  const errors = Graphql.validate(schema, queryAST);
  if (errors.length) {
    return Boom.badRequest(errors.join(', '));
  }

  const result = await Graphql.execute(schema, queryAST, resolvers, request, variables, operationName);
  if (result.errors) {
    request.log(['error', 'graqhql-error'], result);
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
