'use strict';

const Assert = require('assert');
const Graphql = require('graphql');


const internals = {};


// Inspired by graphql-tools
exports.makeExecutableSchema = ({ schema, resolvers = {}, preResolve }) => {
  const parsed = Graphql.parse(schema);
  const astSchema = Graphql.buildASTSchema(parsed, { commentDescriptions: true, assumeValidSDL: true });

  for (const resolverName of Object.keys(resolvers)) {
    const type = astSchema.getType(resolverName);
    if (!type) {
      continue;
    }

    const typeResolver = resolvers[resolverName];

    // go through field resolvers for the parent resolver type
    for (const fieldName of Object.keys(typeResolver)) {
      let fieldResolver = typeResolver[fieldName];

      if (typeof preResolve === 'function') {
        fieldResolver = internals.wrapResolve.call(preResolve, fieldResolver);
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

exports.registerSubscriptions = function(server, schema, options) {
  const fields = schema._subscriptionType.getFields();
  const fieldKeys = Object.keys(fields);
  for (const fieldKey of fieldKeys) {
    let subscriptionPath = `/${fieldKey}`;
    const field = fields[fieldKey];
    if (!field.args.length) {
      server.subscription(subscriptionPath, options);
      continue;
    }

    for (const arg of field.args) {
      subscriptionPath += `/{${arg.name}}`;
    }
    server.subscription(subscriptionPath, options);
  }
};

exports.publish = function(server) {
  return function(name, obj) {
    const schema = this.schema;

    const field = schema._subscriptionType.getFields()[name];
    let publishPath = `/${name}`;

    if (!field.args.length) {
      server.publish(publishPath, obj);
      return;
    }

    for (const arg of field.args) {
      publishPath += `/${obj[arg.name]}`;
    }

    server.publish(publishPath, obj);
  };
};

internals.wrapResolve = function(resolve) {
  return (root, args, request) => {
    const preResolve = this;
    const context = preResolve(root, args, request);

    return resolve.call(context, root, args, request);
  };
};
