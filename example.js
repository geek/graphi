'use strict';

const Hapi = require('hapi');
const Graphi = require('.');

const internals = {};

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


internals.init = async () => {
  try {
    const server = new Hapi.Server({ port: 8000 });

    await server.register({ plugin: Graphi, options: { schema, resolvers, tracing: true } });

    await server.start();

    return server;
  } catch (err) {
    throw err;
  }
};

internals.init()
  .then((server) => {
    console.log('server.info.uri ' + server.info.uri);
    // open http://localhost:8000/graphiql?query=%7B%20person(firstname%3A%20%22billy%22)%20%7B%20lastname%20%7D%20%7D&variables=%7B%7D
    // curl -X POST -H "Content-Type: application/json" -d '{"query":"{person(firstname:\"billy\"){lastname}}"}' http://127.0.0.1:8000/graphql
  })
  .catch((error) => {
    console.log('Error: ' + error);
  });
