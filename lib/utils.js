'use strict';

const Assert = require('assert');
const Graphql = require('graphql');
const GraphqlTools = require('graphql-tools');


const internals = {};


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

exports.mergeSchemas = function (schema, extraSchema) {
  if (!schema) {
    return extraSchema;
  }

  return GraphqlTools.mergeSchemas({ schemas: [schema, extraSchema] });
};

internals.wrapResolve = function (preResolve, resolve) {
  return (root, args, request) => {
    const context = preResolve(root, args, request);

    return resolve.call(context, root, args, request);
  };
};
