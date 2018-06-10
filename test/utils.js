'use strict';

const Code = require('code');
const GraphQL = require('graphql');
const Hapi = require('hapi');
const Lab = require('lab');
const Graphi = require('../');
const Utils = require('../lib/utils');


// Test shortcuts

const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;
const expect = Code.expect;


describe('makeExecutableSchema()', () => {
  it('converts a graphql schema into executable graphql objects', () => {
    const schema = `
      input Someone {
        name: String
      }

      interface IPerson {
        firstname: String
      }

      type Person implements IPerson {
        firstname: String!
        lastname: String!
        email: String!
        description: People
        ability: Ability
        search: SearchResult
      }

      scalar People

      enum Ability {
        COOK
        PROGRAM
      }

      union SearchResult = Person | String

      type Query {
        person(firstname: String!): Person!
      }
    `;

    const resolvers = {
      Query: {
        person: () => {}
      },
      People: {
        description: () => {}
      },
      Ability: {
        COOK: () => {}
      },
      Person: {
        ability: () => {},
        description: () => {},
        search: () => {}
      },
      IPerson: {
        firstname: () => {}
      },
      Someone: {
        name: () => {}
      }
    };

    const executable = Utils.makeExecutableSchema({ schema, resolvers });
    expect(executable instanceof GraphQL.GraphQLSchema).to.be.true();
  });

  it('converts a graphql schema with joi scalars', async () => {
    const schema = `
      type Person {
        firstname: String @JoiString(min: 2, max: 100, normalize: "NFC", uppercase: true)
        lastname: String
        email: String!
      }

      type Query {
        person(personname: String @JoiString(max: 5)): Person!
      }
    `;

    const resolvers = {
      Query: {
        person: (root, { personname }) => {
          return { firstname: personname, lastname: 'pluck' };
        }
      }
    };

    const executable = Utils.makeExecutableSchema({ schema, resolvers });
    expect(executable instanceof GraphQL.GraphQLSchema).to.be.true();

    const server = Hapi.server({ debug: { request: ['error'] }});
    await server.register({ plugin: Graphi, options: { schema: executable } });

    await server.initialize();

    const payload = { query: 'query { person(personname: "peter") { firstname lastname } }' };
    const res = await server.inject({ method: 'POST', url: '/graphql', payload });
    expect(res.statusCode).to.equal(200);
    expect(res.result.data.person.firstname).to.equal('PETER');
    expect(res.result.data.person.lastname).to.equal('pluck');
  });

  it('converts a graphql schema with joi scalars and validation errors in query', async () => {
    const schema = `
      type Person {
        firstname: String @JoiString(min: 2, max: 100, trim: true)
        lastname: String
        email: String!
      }

      type Query {
        person(personname: String @JoiString(max: 4)): Person!
      }
    `;

    const resolvers = {
      Query: {
        person: (root, { personname }) => {
          expect(personname).to.be.error();
          expect(personname.message).to.contain('length must be less than or equal to 4 characters');
          return { lastname: 'pluck' };
        }
      }
    };

    const executable = Utils.makeExecutableSchema({ schema, resolvers });
    expect(executable instanceof GraphQL.GraphQLSchema).to.be.true();

    const server = Hapi.server({ debug: { request: ['error'] }});
    await server.register({ plugin: Graphi, options: { schema: executable } });

    await server.initialize();

    const payload = { query: 'query { person(personname: "peter") { lastname } }' };
    const res = await server.inject({ method: 'POST', url: '/graphql', payload });
    expect(res.statusCode).to.equal(200);
    expect(res.result.data.person.lastname).to.equal('pluck');
  });

  it('only converts valid Joi directives', async () => {
    const schema = `
      type Person {
        firstname: String @JoiInvalid(min: 2, max: 100)
        lastname: String
        email: String!
      }

      type Query {
        person(personname: String @JoiInvalid(foo: "bar")): Person!
      }
    `;

    const resolvers = {
      Query: {
        person: (root, { personname }) => {
          expect(personname).to.equal('peter');
          return { lastname: 'pluck' };
        }
      }
    };

    const executable = Utils.makeExecutableSchema({ schema, resolvers });
    expect(executable instanceof GraphQL.GraphQLSchema).to.be.true();

    const server = Hapi.server({ debug: { request: ['error'] }});
    await server.register({ plugin: Graphi, options: { schema: executable } });

    await server.initialize();

    const payload = { query: 'query { person(personname: "peter") { lastname } }' };
    const res = await server.inject({ method: 'POST', url: '/graphql', payload });
    expect(res.statusCode).to.equal(200);
    expect(res.result.data.person.lastname).to.equal('pluck');
  });

  it('converts a graphql schema and executes preResolve first', async () => {
    const schema = `
      type Person {
        firstname: String!
        lastname: String!
      }

      type Query {
        person(firstname: String!): Person!
      }
    `;

    const resolvers = {
      Query: {
        person: () => {
          return { firstname: 'peter', lastname: 'pluck' };
        }
      },
      Person: {
        firstname: function (root, args, request) {
          expect(this.fu).to.equal('bar');
          return root.firstname.toUpperCase();
        },
        lastname: function (root, args, request) {
          expect(this.fu).to.equal('bar');
          return root.lastname.toUpperCase();
        }
      }
    };

    const preResolve = () => {
      return { fu: 'bar' };
    };

    const executable = Utils.makeExecutableSchema({ schema, resolvers, preResolve });
    expect(executable instanceof GraphQL.GraphQLSchema).to.be.true();

    const server = Hapi.server();
    await server.register({ plugin: Graphi, options: { schema: executable } });

    await server.initialize();

    const payload = { query: 'query { person(firstname: "peter") { firstname lastname } }' };
    const res = await server.inject({ method: 'POST', url: '/graphql', payload });
    expect(res.statusCode).to.equal(200);
    expect(res.result.data.person.firstname).to.equal('PETER');
    expect(res.result.data.person.lastname).to.equal('PLUCK');
  });

  it('errors when resolver missing from schema', () => {
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

    let err;
    try {
      Graphi.makeExecutableSchema({ schema, resolvers: { Query: { human: () => {} } } });
    } catch (ex) {
      err = ex;
    }

    expect(err).to.be.error();
  });
});
