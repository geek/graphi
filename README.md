# graphi
hapi graphql server plugin

[![Build Status](https://secure.travis-ci.org/geek/graphi.svg)](http://travis-ci.org/geek/graphi)


## Usage

### With promises

```js
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
  return new Promise((resolve) => {
    // args.firstname will be set, request is the hapi request object
    resolve({ firstname: 'billy', lastname: 'jean' });
  });
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

### With callbacks

const schema = `
  type Person {
    firstname: String!
    lastname: String!
  }

  type Query {
    person(firstname: String!): Person!
  }
`;

const getPerson = function (args, request, cb) {
  cb(null, { firstname: 'billy', lastname: 'jean' });
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

## Options

- `graphqlPath` - HTTP path to serve graphql requests. Default is `/graphql`
- `graphiqlPath` - HTTP path to serve the GraphiQL UI. Set to '' or false to disable. Default is `/graphiql`
- `schema` - graphql schema either as a string or parsed schema object
- `resolvers` - query and mutation functions mapped to their respective keys. Resolvers can either return a Promise or expect a callback function as the last argument and execute it when done.
