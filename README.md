# graphi
hapi graphql server plugin


## Usage

```js
const schema = `type Person {
    firstname: String!
    lastname: String!
  }

  type Query {
    person(firstname: String!): String!
  }`;

const getPerson = function (args, request) {
  return new Promise((resolve) => {
    resolve('My Person');
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
