'use strict';

const Hapi = require('hapi');
const Graphi = require('.');

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
    resolve({ firstname: 'billy', lastname: 'jean' });
  });
};

const resolvers = {
  person: getPerson
};

const server = new Hapi.Server();
server.connection({ port: 8000 });
server.register({ register: Graphi, options: { schema, resolvers } }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  server.start((err) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    console.log('server started at localhost:8000');
    // open http://localhost:8000/graphiql?query=%7B%20person(firstname%3A%20%22billy%22)%20%7B%20lastname%20%7D%20%7D&variables=%7B%7D
  });
});
