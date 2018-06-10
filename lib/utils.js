'use strict';

const Assert = require('assert');
const Graphql = require('graphql');
const GraphqlTools = require('graphql-tools');
const Scalars = require('scalars');


const internals = {};


// Inspired by graphql-tools
exports.makeExecutableSchema = ({ schema, resolvers = {}, preResolve }) => {
  const parsed = Graphql.parse(schema);
  const astSchema = Graphql.buildASTSchema(parsed, { commentDescriptions: true });
  internals.decorateDirectives(astSchema, parsed);

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

  // console.log(astSchema._typeMap['Person']._fields.firstname.type.__proto__)
  return astSchema;
};

exports.mergeSchemas = function (schema, extraSchema) {
  if (!schema) {
    return extraSchema;
  }

  return GraphqlTools.mergeSchemas({ schemas: [schema, extraSchema] });
};

internals.decorateDirectives = function (astSchema, parsed) {
  for (const definition of parsed.definitions) {
    if (definition.kind !== 'ObjectTypeDefinition') {
      continue;
    }

    for (const field of definition.fields) {
      for (const directive of field.directives) {
        const scalar = internals.createScalar(directive.name.value, directive.arguments);
        if (!scalar) {
          continue;
        }

        // Set the type on the schame directly (not the parsed object)
        astSchema._typeMap[definition.name.value]._fields[field.name.value].type = scalar;
      }

      for (const argument of field.arguments) {
        for (const directive of argument.directives) {
          const scalar = internals.createScalar(directive.name.value, directive.arguments);
          if (!scalar) {
            continue;
          }

          const foundArg = astSchema._typeMap[definition.name.value]._fields[field.name.value].args.find((arg) => {
            return arg.name === argument.name.value;
          });

          foundArg.type = scalar;
        }
      }
    }
  }
};

internals.createScalar = function (name, args) {
  const scalarFn = Scalars[name];
  if (typeof scalarFn !== 'function') {
    return;
  }

  const formattedArgs = {};
  for (const arg of args) {
    let value = arg.value.value;
    if (arg.value.kind === 'IntValue') {
      value = parseInt(value, 10);
    } else if (arg.value.kind === 'BooleanValue') {
      value = Boolean(value);
    }
    formattedArgs[arg.name.value] = value;
  }

  return scalarFn(formattedArgs);
};

internals.wrapResolve = function (resolve) {
  return (root, args, request) => {
    const preResolve = this;
    const context = preResolve(root, args, request);

    return resolve.call(context, root, args, request);
  };
};
