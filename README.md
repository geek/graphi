# graphi
hapi GraphQL server plugin

[![Build Status](https://secure.travis-ci.org/geek/graphi.svg)](http://travis-ci.org/geek/graphi)


## Options

- `graphqlPath` - HTTP path to serve graphql requests. Default is `/graphql`
- `graphiqlPath` - HTTP path to serve the GraphiQL UI. Set to '' or false to disable. Default is `/graphiql`
- `schema` - graphql schema either as a string or as a GraphQLSchema instance
- `resolvers` - query and mutation functions mapped to their respective keys. Resolvers should return a promise when performing asynchronous operations.
- `authStrategy` - (optional) Authentication strategy to apply to `/graphql` route.  Default is `false`.
- `graphiAuthStrategy` - (optional) Authentication strategy to apply to `/graphiql` route.  Default is `false`.

## API

- `graphql` - exported Graphql module that graphi uses
- `makeExecutableSchema({ schema, resolvers, preResolve })` - combine resolvers with the schema definition into a `GraphQLSchema`.

## Usage

```javascript
const schema = `
  type Person {
    firstname: String!
    lastname: String!
  }

  type Query {
    person(firstname: String!): Person!
  }
`;

const getPerson = function (args, request) {
  return { firstname: 'billy', lastname: 'jean' };
};

const resolvers = {
  person: getPerson
};

const server = Hapi.server();
await server.register({ plugin: Graphi, options: { schema, resolvers } });
```

### With GraphQLSchema Instance

```javascript
const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'RootQueryType',
    fields: {
      person: {
        type: GraphQLString,
        args: {
          firstname: { type: new Scalars.JoiString({ min: [2, 'utf8'], max: 10 }) }
        },
        resolve: (root, { firstname }, request) => {
          return firstname;
        }
      }
    }
  })
});

const server = Hapi.server();
await server.register({ plugin: Graphi, options: { schema } });
```


### With hapi routes

You can also define resolvers as hapi routes. As a result, each resolver is able to benefit from route caching, custom auth strategies, and all of the other powerful hapi routing features. Each route should use the custom method `'graphql'` and the path should be the key name for the resolver prefixed with `/`. You can also mix and match existing resolvers with routes.

```javascript
const schema = `
  type Person {
    firstname: String!
    lastname: String!
  }

  type Query {
    person(firstname: String!): Person!
  }
`;


const server = Hapi.server();
server.route({
  method: 'graphql',
  path: '/person',
  handler: (request, h) => {
    // request.payload contains any arguments sent to the query
    return { firstname: 'billy', lastname: 'jean' };
  }
});

await server.register({ plugin: Graphi, options: { schema } });
```
