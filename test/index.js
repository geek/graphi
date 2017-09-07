'use strict';


const GraphQL = require('graphql');
const Hapi = require('hapi');
const Lab = require('lab');
const Scalars = require('scalars');
const Graphi = require('../');


const { GraphQLObjectType, GraphQLSchema, GraphQLString } = GraphQL;
const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;
const expect = Lab.expect;


describe('graphi', () => {
  it('can be registered with hapi', (done) => {
    const server = new Hapi.Server();
    server.connection();
    server.register(Graphi, (err) => {
      expect(err).to.not.exist();
      done();
    });
  });

  it('will handle graphql GET requests with promise resolver', (done) => {
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
      expect(args.firstname).to.equal('tom');
      expect(request.path).to.equal('/graphql');
      return new Promise((resolve) => {
        resolve({ firstname: 'tom', lastname: 'arnold' });
      });
    };

    const resolvers = {
      person: getPerson
    };

    const server = new Hapi.Server();
    server.connection();
    server.register({ register: Graphi, options: { schema, resolvers } }, (err) => {
      expect(err).to.not.exist();
      const url = '/graphql?query=%7B%0A%20%20person(firstname%3A%22tom%22)%20%7B%0A%20%20%20%20lastname%0A%20%20%7D%0A%7D&variables=%7B%22hi%22%3A%20true%7D';

      server.inject({ method: 'GET', url }, (res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.result.data.person.lastname).to.equal('arnold');
        done();
      });
    });
  });

  it('will handle graphql GET requests with callback resolver', (done) => {
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
      expect(args.firstname).to.equal('tom');
      expect(request.path).to.equal('/graphql');
      cb(null, { firstname: 'tom', lastname: 'arnold' });
    };

    const resolvers = {
      person: getPerson
    };

    const server = new Hapi.Server();
    server.connection();
    server.register({ register: Graphi, options: { schema, resolvers } }, (err) => {
      expect(err).to.not.exist();
      const url = '/graphql?query=%7B%0A%20%20person(firstname%3A%22tom%22)%20%7B%0A%20%20%20%20lastname%0A%20%20%7D%0A%7D&variables=%7B%22hi%22%3A%20true%7D';

      server.inject({ method: 'GET', url }, (res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.result.data.person.lastname).to.equal('arnold');
        done();
      });
    });
  });

  it('will handle graphql GET requests GraphQL instance schema', (done) => {
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
      expect(err).to.not.exist();
      const url = '/graphql?query=' + encodeURIComponent('{ person(firstname: "tom")}');

      server.inject({ method: 'GET', url }, (res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.result.data.person).to.equal('tom');
        done();
      });
    });
  });

  it('will handle graphql POST requests with query', (done) => {
    const schema = `
      type Person {
        firstname: String!
        lastname: String!
        email: String!
      }

      type Query {
        person(firstname: String!): Person!
      }
    `;

    const getPerson = function (args, request) {
      expect(args.firstname).to.equal('billy');
      expect(request.path).to.equal('/graphql');
      return Promise.resolve({ firstname: '', lastname: 'jean', email: 'what' });
    };

    const resolvers = {
      person: getPerson
    };

    const server = new Hapi.Server();
    server.connection();
    server.register({ register: Graphi, options: { schema, resolvers } }, (err) => {
      expect(err).to.not.exist();
      const payload = { query: 'query { person(firstname: "billy") { lastname, email } }' };

      server.inject({ method: 'POST', url: '/graphql', payload }, (res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.result.data.person.lastname).to.equal('jean');
        done();
      });
    });
  });

  it('will handle graphql POST requests with query using GraphQL schema objects', (done) => {
    const schema = new GraphQL.GraphQLSchema({
      query: new GraphQL.GraphQLObjectType({
        name: 'RootQueryType',
        fields: {
          person: {
            type: GraphQL.GraphQLString,
            args: { firstname: { type: GraphQL.GraphQLString } },
            resolve: (root, args) => {
              expect(args.firstname).to.equal('billy');
              return Promise.resolve('jean');
            }
          }
        }
      })
    });


    const server = new Hapi.Server();
    server.connection();
    server.register({ register: Graphi, options: { schema } }, (err) => {
      expect(err).to.not.exist();
      const payload = { query: 'query { person(firstname: "billy") }' };

      server.inject({ method: 'POST', url: '/graphql', payload }, (res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.result.data.person).to.equal('jean');
        done();
      });
    });
  });

  it('will handle graphql POST requests with mutations', (done) => {
    const schema = `
      type Person {
        id: ID!
        firstname: String!
        lastname: String!
      }

      type Mutation {
        createPerson(firstname: String!, lastname: String!): Person!
      }

      type Query {
        person(firstname: String!): Person!
      }
    `;

    const getPerson = function (args, request) {
      expect(args.firstname).to.equal('billy');
      expect(request.path).to.equal('/graphql');
      return new Promise((resolve) => {
        resolve({ firstname: 'billy', lastname: 'jean' });
      });
    };

    const createPerson = function (args, request) {
      expect(args.firstname).to.equal('billy');
      expect(args.lastname).to.equal('jean');
      expect(request.path).to.equal('/graphql');
      return new Promise((resolve) => {
        resolve({ firstname: 'billy', lastname: 'jean' });
      });
    };

    const resolvers = {
      createPerson,
      person: getPerson
    };

    const server = new Hapi.Server();
    server.connection();
    server.register({ register: Graphi, options: { schema, resolvers } }, (err) => {
      expect(err).to.not.exist();
      const payload = { query: 'mutation { createPerson(firstname: "billy", lastname: "jean") { lastname } }' };

      server.inject({ method: 'POST', url: '/graphql', payload }, (res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.result.data.createPerson.lastname).to.equal('jean');
        done();
      });
    });
  });

  it('will error with requests that include unknown directives', (done) => {
    const schema = `
      type Person {
        firstname: String! @limit(min: 1)
        lastname: String!
      }

      type Query {
        person(firstname: String!): Person!
      }
    `;

    const getPerson = function (args, request) {
      expect(args.firstname).to.equal('billy');
      expect(request.path).to.equal('/graphql');
      return Promise.resolve({ firstname: '', lastname: 'jean' });
    };

    const resolvers = {
      person: getPerson
    };

    const server = new Hapi.Server();
    server.connection();
    server.register({ register: Graphi, options: { schema, resolvers } }, (err) => {
      expect(err).to.not.exist();
      const payload = { query: 'query { person(firstname: "billy") { lastname @foo(min: 2) } }' };

      server.inject({ method: 'POST', url: '/graphql', payload }, (res) => {
        expect(res.statusCode).to.equal(400);
        expect(res.result.message).to.contain('Unknown directive');
        done();
      });
    });
  });

  it('will handle graphql GET requests with invalid variables', (done) => {
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
      expect(args.firstname).to.equal('tom');
      expect(request.path).to.equal('/graphql');
      cb(null, { firstname: 'tom', lastname: 'arnold' });
    };

    const resolvers = {
      person: getPerson
    };

    const server = new Hapi.Server();
    server.connection();
    server.register({ register: Graphi, options: { schema, resolvers } }, (err) => {
      expect(err).to.not.exist();
      const url = '/graphql?query=%7B%0A%20%20person(firstname%3A%22tom%22)%20%7B%0A%20%20%20%20lastname%0A%20%20%7D%0A%7D&variables=invalid';

      server.inject({ method: 'GET', url }, (res) => {
        expect(res.statusCode).to.equal(400);
        done();
      });
    });
  });

  it('will wrap 400 errors', (done) => {
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
      expect(args.firstname).to.equal('tom');
      expect(request.path).to.equal('/graphql');
      return new Promise((resolve) => {
        resolve({ firstname: 'tom', lastname: 'arnold' });
      });
    };

    const resolvers = {
      person: getPerson
    };

    const server = new Hapi.Server();
    server.connection();
    server.register({ register: Graphi, options: { schema, resolvers } }, (err) => {
      expect(err).to.not.exist();
      const url = '/graphql?query={}';

      server.inject({ method: 'GET', url }, (res) => {
        expect(res.statusCode).to.equal(400);
        done();
      });
    });
  });

  it('will wrap errors with a promise resolver', (done) => {
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
      expect(args.firstname).to.equal('tom');
      expect(request.path).to.equal('/graphql');
      return new Promise((resolve, reject) => {
        reject(new Error('my custom error'));
      });
    };

    const resolvers = {
      person: getPerson
    };

    const server = new Hapi.Server();
    server.connection();
    server.register({ register: Graphi, options: { schema, resolvers } }, (err) => {
      expect(err).to.not.exist();
      const url = '/graphql?query=%7B%0A%20%20person(firstname%3A%22tom%22)%20%7B%0A%20%20%20%20lastname%0A%20%20%7D%0A%7D';

      server.inject({ method: 'GET', url }, (res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.result.errors).to.exist();
        done();
      });
    });
  });

  it('will wrap errors with a callback resolver', (done) => {
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
      expect(args.firstname).to.equal('tom');
      expect(request.path).to.equal('/graphql');
      cb(new Error('my custom error'));
    };

    const resolvers = {
      person: getPerson
    };

    const server = new Hapi.Server();
    server.connection();
    server.register({ register: Graphi, options: { schema, resolvers } }, (err) => {
      expect(err).to.not.exist();
      const url = '/graphql?query=%7B%0A%20%20person(firstname%3A%22tom%22)%20%7B%0A%20%20%20%20lastname%0A%20%20%7D%0A%7D';

      server.inject({ method: 'GET', url }, (res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.result.errors).to.exist();
        done();
      });
    });
  });

  it('will serve the GraphiQL UI', (done) => {
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
    server.connection();
    server.register({ register: Graphi, options: { schema, resolvers } }, { routes: { prefix: '/test' } }, (err) => {
      expect(err).to.not.exist();

      server.inject({ method: 'GET', url: '/test/graphiql' }, (res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.result).to.contain('<html>');
        done();
      });
    });
  });

  it('will serve the GraphiQL UI prepopulated with the query', (done) => {
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
    server.connection();
    server.register({ register: Graphi, options: { schema, resolvers } }, (err) => {
      expect(err).to.not.exist();

      server.inject({ method: 'GET', url: '/graphiql?query=%7B%0A%20%20person(firstname%3A%22tom%22)%20%7B%0A%20%20%20%20lastname%0A%20%20%7D%0A%7D&variables=%7B%22hi%22%3A%20true%7D' }, (res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.result).to.contain('person');
        done();
      });
    });
  });

  it('can disable GraphiQL UI', (done) => {
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
    server.connection();
    server.register({ register: Graphi, options: { schema, resolvers, graphiqlPath: false } }, (err) => {
      expect(err).to.not.exist();

      server.inject({ method: 'GET', url: '/graphiql' }, (res) => {
        expect(res.statusCode).to.equal(404);
        done();
      });
    });
  });

  it('will handle nested queries', (done) => {
    const schema = `
      type Person {
        firstname: String!
        lastname: String!
        friends(firstname: String!): [Person]
      }

      type Query {
        person(firstname: String!): Person!
      }
    `;

    const getFriends = function (args, request) {
      expect(args.firstname).to.equal('michael');

      return new Promise((resolve) => {
        resolve([{ firstname: 'michael', lastname: 'jackson' }]);
      });
    };

    const getPerson = function (args, request) {
      expect(args.firstname).to.equal('billy');
      expect(request.path).to.equal('/graphql');

      return new Promise((resolve) => {
        resolve({ firstname: 'billy', lastname: 'jean', friends: getFriends });
      });
    };

    const resolvers = {
      person: getPerson,
      friends: getFriends
    };

    const server = new Hapi.Server();
    server.connection();
    server.register({ register: Graphi, options: { schema, resolvers } }, (err) => {
      expect(err).to.not.exist();
      const payload = {
        query: 'query GetPersonsFriend($firstname: String!, $friendsFirstname: String!) { person(firstname: $firstname) { friends(firstname: $friendsFirstname) { lastname } } }',
        variables: { firstname: 'billy', friendsFirstname: 'michael' }
      };

      server.inject({ method: 'POST', url: '/graphql', payload }, (res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.result.data.person.friends[0].lastname).to.equal('jackson');
        done();
      });
    });
  });

  it('will handle invalid queries in POST request', (done) => {
    const schema = `
      type Person {
        firstname: String!
        lastname: String!
        friends(firstname: String!): [Person]
      }

      type Query {
        person(firstname: String!): Person!
      }
    `;

    const getFriends = function (args, request) {
      expect(args.firstname).to.equal('michael');

      return new Promise((resolve) => {
        resolve([{ firstname: 'michael', lastname: 'jackson' }]);
      });
    };

    const getPerson = function (args, request) {
      expect(args.firstname).to.equal('billy');
      expect(request.path).to.equal('/graphql');

      return new Promise((resolve) => {
        resolve({ firstname: 'billy', lastname: 'jean', friends: getFriends });
      });
    };

    const resolvers = {
      person: getPerson,
      friends: getFriends
    };

    const server = new Hapi.Server();
    server.connection();
    server.register({ register: Graphi, options: { schema, resolvers } }, (err) => {
      expect(err).to.not.exist();
      const payload = {
        query: 'query GetPersonsF} }',
        variables: { firstname: 'billy', friendsFirstname: 'michael' }
      };

      server.inject({ method: 'POST', url: '/graphql', payload }, (res) => {
        expect(res.statusCode).to.equal(400);
        done();
      });
    });
  });
});
