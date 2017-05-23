# graphi
hapi graphql server plugin

[![Build Status](https://secure.travis-ci.org/geek/graphi.svg)](http://travis-ci.org/geek/graphi)


## Usage

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

const functions = {
  person: getPerson
};

const server = new Hapi.Server();
server.connection();
server.register({ register: Graphi, options: { schema, functions } }, (err) => {
  // server is ready to be started
});
```


## Options

- `path` - HTTP path to serve graphql requests. Default is `/graphql`
- `schema` - graphql schema either as a string or parsed schema object
- `functions` - query and mutation functions mapped to their respective keys
