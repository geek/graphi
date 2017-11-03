# graphi
hapi GraphQL server plugin

[![Build Status](https://secure.travis-ci.org/geek/graphi.svg)](http://travis-ci.org/geek/graphi)


## Options

- `graphqlPath` - HTTP path to serve graphql requests. Default is `/graphql`
- `graphiqlPath` - HTTP path to serve the GraphiQL UI. Set to '' or false to disable. Default is `/graphiql`
- `schema` - graphql schema either as a string or as a GraphQLSchema instance
- `resolvers` - query and mutation functions mapped to their respective keys. Resolvers should return a promise when performing asynchronous operations.


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
  return Promise.resolve({ firstname: 'billy', lastname: 'jean' });
};

const resolvers = {
  person: getPerson
};

const server = new Hapi.Server();
server.connection();
server.register({ register: Graphi, options: { schema, resolvers } }, (err) => {
  // server is ready to be started
});
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
          return Promise.resolve(firstname);
        }
      }
    }
  })
});

const server = new Hapi.Server();
server.connection();
server.register({ register: Graphi, options: { schema } }, (err) => {
  // server is ready to be started
});
```
