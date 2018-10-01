# graphi
hapi GraphQL server plugin with Joi scalars

[![Build Status](https://secure.travis-ci.org/geek/graphi.svg)](http://travis-ci.org/geek/graphi)


## Options

- `graphqlPath` - HTTP path to serve graphql requests. Default is `/graphql`
- `graphiqlPath` - HTTP path to serve the GraphiQL UI. Set to '' or false to disable. Default is `/graphiql`
- `schema` - graphql schema either as a string or as a GraphQLSchema instance
- `resolvers` - query and mutation functions mapped to their respective keys. Resolvers should return a promise when performing asynchronous operations.
- `authStrategy` - (optional) Authentication strategy to apply to `/graphql` route.  Default is `false`.
- `graphiAuthStrategy` - (optional) Authentication strategy to apply to `/graphiql` route.  Default is `false`.

## API

The following decorations are made to the hapi server to make it easier to use a single graphi plugin with multiple other plugins depending on it.

- `server.registerSchema({ schema, resolvers })` - similar to the original registration options for the plugin, but this will merge the schema with any prior schema that is already registered with the server. This is useful for combining multiple graphql schemas/resolvers together into a single server.
- `server.makeExecutableSchema({ schema, resolvers, preResolve })` - combine resolvers with the schema definition into a `GraphQLSchema`.
- `server.plugins.graphi.publish(message, object)` - Publish a message to any subscribers where `message` is the name of the message and `object` is the contents of the message.


The follow properties are exported directly when you `require('graphi')`
- `graphql` - exported Graphql module that graphi uses
- `makeExecutableSchema({ schema, resolvers, preResolve })` - combine resolvers with the schema definition into a `GraphQLSchema`.

## Usage

```javascript
const schema = `
  type Person {
    firstname: String! @JoiString(min 4)
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

## Joi scalar support

Any schema that is expressed with JoiType directives is converted to valid scalars. As a result, using graphi you are able to create more expressive GraphQL schema definitions. For example, if you want to allow the creation of a well formed user the schema can look like the following, resulting in validated input fields before the fields are passed to any resolvers.

```
type Mutation {
  createUser(name: String @JoiString(min 2), email: String @JoiString(email: true, max: 128))
}
```

Additionally, you can also use the Joi scalars to perform extra preprosessing or postprocessing on you data. For example, the following schema will result in `firstname` being uppercased on the response.

```
type Person {
  firstname: String @JoiString(uppercase: true)
}
```


