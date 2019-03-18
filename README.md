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
- `formatError` - (optional) Function that receives a [GraphQLError](https://github.com/graphql/graphql-js/blob/271e23e13ec093e7ffb844e7ffaf340ab92f053e/src/error/GraphQLError.js) as its only argument and returns a custom error object, which is returned to the client.
- `subscriptionOptions` - (optional) Any options to pass to the [nes subscription function](https://github.com/hapijs/nes/blob/master/API.md#serversubscriptionpath-options).

## API

The following decorations are made to the hapi server to make it easier to use a single graphi plugin with multiple other plugins depending on it.

- `server.registerSchema({ schema, resolvers })` - overwrites an existing registered schema with a new one.
- `server.makeExecutableSchema({ schema, resolvers, preResolve })` - combine resolvers with the schema definition into a `GraphQLSchema`.
- `server.plugins.graphi.publish(message, object)` - Publish a message to any subscribers where `message` is the name of the message and `object` is the contents of the message.


The follow properties are exported directly when you `require('graphi')`
- `graphql` - exported Graphql module that graphi uses
- `makeExecutableSchema({ schema, resolvers, preResolve })` - combine resolvers with the schema definition into a `GraphQLSchema`.

## Events

The following server events are registered and available on `server.events.on` or `server.events.once`.

- `preFieldResolver` - emitted before executing a resolver function. The event listener function is executed with an object argument that contains the following properties:
  - `source`
  - `args`
  - `contextValue`
  - `info`

- `postFieldResolver` - emitted after executing a resolver function. The event listener function is executed with an object argument that contains the following properties:
  - `source`
  - `args`
  - `contextValue`
  - `info`
  - `result`

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
          firstname: { type: GraphQLString }
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

You can also define resolvers as hapi routes. As a result, each resolver is able to benefit from route caching, custom auth strategies, and all of the other powerful hapi routing features. Each route should either use the custom method `'graphql'` or it should add a tag named `'graphql'` and the path should be the key name for the resolver prefixed with `/`. You can also mix and match existing resolvers with routes.

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

This enables existing RESTful APIs to be easily converted over to GraphQL resolvers:

```javascript
server.route({
  method: 'POST',
  path: '/person',
  config: {
    tags: ['graphql'],
    handler: (request, h) => {
      // request.payload contains any arguments sent to the query
      return { firstname: 'billy', lastname: 'jean' };
    }
  }
});
```

### With Subscriptions

Graphi leverages [nes](https://github.com/hapijs/nes) to manage GraphQL subscriptions. Therefore, if you do intend to use subscriptions you will need to register nes with the hapi server. On the server a schema that contains subscriptions will automatically have those subscriptions registered with nes and graphi will expose helper functions to make publishing to subscribers easier. There is a `server.plugins.graphi.publish(message, object)` helper to make this easier to publish to any potential subscribers. Below is a complete example of registering a schema and then publishing to it.

```js
const schema = `
  type Person {
    firstname: String!
    lastname: String!
    email: String!
  }

  type Subscription {
    personCreated(firstname: String!): Person!
  }
`;

const server = Hapi.server();
await server.register(Nes);
await server.register({ plugin: Graphi, options: { schema } });
await server.start();

server.plugins.graphi.publish('personCreated', { firstname: 'Peter', lastname: 'Pluck', email: 'test@test.com' });
```

Any clients that are subscribed to the `personCreated` event for the person with `firstname = 'Peter'` will receive the message that was published.

At the moment clients are required to use a nes compatible library and to subscribe to events using the `client.subscribe` function. The path that clients should use depends on the message, but in the previous example this would be `'/personCreated/peter'`.
