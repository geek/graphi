'use strict';

const Barrier = require('cb-barrier');
const Code = require('code');
const GraphQL = require('graphql');
const Hapi = require('hapi');
const HapiAuthBearerToken = require('hapi-auth-bearer-token');
const Lab = require('lab');
const Nes = require('nes');
const { MockTracer } = require('opentracing');
const Traci = require('traci');
const Wreck = require('wreck');
const Graphi = require('../');


// Test shortcuts

const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;
const expect = Code.expect;


// Declare internals

const internals = {};


describe('graphi', () => {
  it('can be registered with hapi', async () => {
    const server = Hapi.server();
    await server.register(Graphi);
  });

  it('exposes graphql library as a property', () => {
    expect(Graphi.graphql).to.exist();
  });

  it('will handle graphql GET requests with promise resolver', async () => {
    const schema = `
      type Person {
        firstname: String! @Joi(min: 1)
        lastname: String!
      }

      type Query {
        person(firstname: String!): Person!
      }
    `;

    const getPerson = function (args, request) {
      expect(args.firstname).to.equal('tom');
      expect(request.path).to.equal('/graphql');
      return { firstname: 'tom', lastname: 'arnold' };
    };

    const resolvers = {
      person: getPerson
    };

    const server = Hapi.server();
    await server.register({ plugin: Graphi, options: { schema, resolvers } });
    await server.initialize();

    const url = '/graphql?query=%7B%0A%20%20person(firstname%3A%22tom%22)%20%7B%0A%20%20%20%20lastname%0A%20%20%7D%0A%7D&variables=%7B%22hi%22%3A%20true%7D';
    const res = await server.inject({ method: 'GET', url });
    expect(res.statusCode).to.equal(200);
    expect(res.result.data.person.lastname).to.equal('arnold');
  });

  it('will emit events around resolvers', async () => {
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
      return { firstname: 'tom', lastname: 'arnold' };
    };

    const resolvers = {
      person: getPerson
    };

    const server = Hapi.server();
    await server.register({ plugin: Graphi, options: { schema, resolvers } });
    await server.initialize();

    let preEventHandled = false;
    server.events.once('preFieldResolver', (data) => {
      preEventHandled = true;
      expect(data.args.firstname).to.equal('tom');
    });

    let postEventHandled = false;
    server.events.once('postFieldResolver', (data) => {
      postEventHandled = true;
      expect(data.args.firstname).to.equal('tom');
    });

    const url = '/graphql?query=%7B%0A%20%20person(firstname%3A%22tom%22)%20%7B%0A%20%20%20%20lastname%0A%20%20%7D%0A%7D&variables=%7B%22hi%22%3A%20true%7D';
    const res = await server.inject({ method: 'GET', url });
    expect(preEventHandled).to.be.true();
    expect(postEventHandled).to.be.true();
    expect(res.statusCode).to.equal(200);
    expect(res.result.data.person.lastname).to.equal('arnold');
  });

  it('will handle graphql POST requests with query', async () => {
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
      return { firstname: '', lastname: 'jean', email: 'what' };
    };

    const resolvers = {
      person: getPerson
    };

    const server = Hapi.server();
    await server.register({ plugin: Graphi, options: { schema, resolvers } });
    await server.initialize();

    const payload = { query: 'query { person(firstname: "billy") { lastname, email } }' };
    const res = await server.inject({ method: 'POST', url: '/graphql', payload });
    expect(res.statusCode).to.equal(200);
    expect(res.result.data.person.lastname).to.equal('jean');
  });

  it('will handle graphql subscription from nes client', async () => {
    const schema = `
      type Person {
        firstname: String!
        lastname: String!
        email: String!
      }

      type Subscription {
        personCreated: Person!
      }
    `;

    const server = Hapi.server();
    await server.register(Nes);
    await server.register({ plugin: Graphi, options: { schema } });
    await server.start();

    const barrier = new Barrier();
    const client = new Nes.Client(`http://localhost:${server.info.port}`);
    await client.connect();

    await client.subscribe('/personCreated', ({ firstname }) => {
      expect(firstname).to.equal('foo');
      client.disconnect();
      barrier.pass();
    });

    server.publish('/personCreated', { firstname: 'foo', lastname: 'bar', email: 'test@test.com' });

    await barrier;
    await server.stop();
  });

  it('will handle graphql subscription graphi.publish with arguments', async () => {
    const schema = `
      type Person {
        firstname: String!
        lastname: String!
        email: String!
      }

      type Subscription {
        personCreated(firstname: String): Person!
      }
    `;

    const server = Hapi.server();
    await server.register(Nes);
    await server.register({ plugin: Graphi, options: { schema } });
    await server.start();

    const barrier = new Barrier();
    const client = new Nes.Client(`http://localhost:${server.info.port}`);
    await client.connect();

    await client.subscribe('/personCreated/john', ({ firstname }) => {
      expect(firstname).to.equal('john');
      client.disconnect();
      barrier.pass();
    });

    server.plugins.graphi.publish('personCreated', { firstname: 'foo', lastname: 'bar', email: 'test@test.com' });
    server.plugins.graphi.publish('personCreated', { firstname: 'john', lastname: 'smith', email: 'test@test.com' });

    await barrier;
    await server.stop();
  });

  it('will handle graphql subscription graphi.publish without arguments', async () => {
    const schema = `
      type Person {
        firstname: String!
        lastname: String!
        email: String!
      }

      type Subscription {
        personCreated: Person!
      }
    `;

    const server = Hapi.server();
    await server.register(Nes);
    await server.register({ plugin: Graphi, options: { schema } });
    await server.start();

    const barrier = new Barrier();
    const client = new Nes.Client(`http://localhost:${server.info.port}`);
    await client.connect();

    await client.subscribe('/personCreated', ({ firstname }) => {
      expect(firstname).to.equal('foo');
      client.disconnect();
      barrier.pass();
    });

    server.plugins.graphi.publish('personCreated', { firstname: 'foo', lastname: 'bar', email: 'test@test.com' });

    await barrier;
    await server.stop();
  });

  it('will handle graphql subscription with arguments published through graphi', async () => {
    const schema = `
      type Person {
        firstname: String!
        lastname: String!
        email: String!
      }

      type Subscription {
        personCreated(firstname: String): Person!
      }
    `;

    const server = Hapi.server();
    await server.register(Nes);
    await server.register({ plugin: Graphi, options: { schema } });
    await server.start();

    const barrier = new Barrier();
    const client = new Nes.Client(`http://localhost:${server.info.port}`);
    await client.connect();

    await client.subscribe('/personCreated/john', ({ firstname, lastname }) => {
      expect(firstname).to.equal('john');
      expect(lastname).to.equal('smith');
      client.disconnect();
      barrier.pass();
    });

    server.plugins.graphi.publish('personCreated', { firstname: 'foo', lastname: 'bar', email: 'test@test.com' });
    server.plugins.graphi.publish('personCreated', { firstname: 'john', lastname: 'smith', email: 'test@test.com' });

    await barrier;
    await server.stop();
  });

  it('will throw for subscription schemas when nes isn\'t registered', async () => {
    const schema = `
      type Person {
        firstname: String!
        lastname: String!
        email: String!
      }

      type Subscription {
        personCreated: Person!
      }
    `;

    const server = Hapi.server();
    await expect(server.register({ plugin: Graphi, options: { schema } })).to.reject(Error);
  });

  it('will handle graphql queries over websockets', async () => {
    const schema = `
      type Person {
        firstname: String! @Joi(min: 1)
        lastname: String!
      }

      type Query {
        person(firstname: String!): Person!
      }
    `;

    const getPerson = function (args, request) {
      expect(args.firstname).to.equal('tom');
      expect(request.path).to.equal('/graphql');
      return { firstname: 'tom', lastname: 'arnold' };
    };

    const resolvers = {
      person: getPerson
    };

    const server = Hapi.server();
    await server.register(Nes);
    await server.register({ plugin: Graphi, options: { schema, resolvers } });
    await server.start();

    const client = new Nes.Client(`http://localhost:${server.info.port}`);
    await client.connect();

    const payload = { query: 'query { person(firstname: "tom") { lastname } }' };
    const result = await client.request({ method: 'POST', path: '/graphql', payload });
    await server.stop();

    expect(result.payload.data.person.lastname).to.equal('arnold');
  });

  it('will log tracing information when traci is registered', async () => {
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
      return { firstname: '', lastname: 'jean', email: 'what' };
    };

    const resolvers = {
      person: getPerson
    };

    const server = Hapi.server();
    await server.register({ plugin: Traci, options: { tracer: new MockTracer() } });
    await server.register({ plugin: Graphi, options: { schema, resolvers } });
    await server.initialize();

    const payload = { query: 'query { person(firstname: "billy") { lastname, email } }' };
    const res = await server.inject({ method: 'POST', url: '/graphql', payload });
    expect(res.statusCode).to.equal(200);
    expect(res.result.data.person.lastname).to.equal('jean');
    const report = server.tracer.report();

    const span = report.debugSpans.find((span) => {
      return span.operation === 'graphql_request';
    });

    const fieldSpan = report.spans.find((span) => {
      return span._operationName === 'graphql_resolver';
    });

    expect(fieldSpan._logs[0].fields.field).to.equal('person');
    expect(span).to.exist();
  });

  it('will log to a tracer with error information for invalid query', async () => {
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
      return { firstname: '', lastname: 'jean', email: 'what' };
    };

    const resolvers = {
      person: getPerson
    };

    const server = Hapi.server();
    await server.register({ plugin: Traci, options: { tracer: new MockTracer() } });
    await server.register({ plugin: Graphi, options: { schema, resolvers } });
    await server.initialize();

    const payload = { query: 'query { person(firstname: "billy) { lastname, email } }' };
    const res = await server.inject({ method: 'POST', url: '/graphql', payload });
    expect(res.statusCode).to.equal(400);
    expect(res.payload).to.contain('Unterminated string');
    const report = server.tracer.report();
    const span = report.spans.find((span) => {
      return span._operationName === 'graphql_request';
    });
    expect(span).to.exist();
    expect(span._logs[1].fields.event).to.equal('error');
  });

  it('will log error details to a tracer when request has invalid variables', async () => {
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
      return Promise.resolve({ firstname: 'tom', lastname: 'arnold' });
    };

    const resolvers = {
      person: getPerson
    };

    const server = Hapi.server();
    await server.register({ plugin: Traci, options: { tracer: new MockTracer() } });
    await server.register({ plugin: Graphi, options: { schema, resolvers } });
    await server.initialize();

    const url = '/graphql?query=%7B%0A%20%20person(firstname%3A%22tom%22)%20%7B%0A%20%20%20%20lastname%0A%20%20%7D%0A%7D&variables=invalid';
    const res = await server.inject({ method: 'GET', url });
    expect(res.statusCode).to.equal(400);
    const report = server.tracer.report();
    const span = report.spans.find((span) => {
      return span._operationName === 'graphql_request';
    });
    expect(span).to.exist();
    expect(span._logs[1].fields.event).to.equal('error');
  });

  it('will log to a tracer when there are unknown directives', async () => {
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
      return { firstname: '', lastname: 'jean' };
    };

    const resolvers = {
      person: getPerson
    };

    const server = Hapi.server();
    await server.register({ plugin: Traci, options: { tracer: new MockTracer() } });
    await server.register({ plugin: Graphi, options: { schema, resolvers } });
    await server.initialize();

    const payload = { query: 'query { person(firstname: "billy") { lastname @foo(min: 2) } }' };
    const res = await server.inject({ method: 'POST', url: '/graphql', payload });
    expect(res.statusCode).to.equal(400);
    expect(res.result.message).to.contain('Unknown directive');
    const report = server.tracer.report();
    const span = report.spans.find((span) => {
      return span._operationName === 'graphql_request';
    });
    expect(span).to.exist();
    expect(span._logs[1].fields.event).to.equal('error');
  });

  it('logs to a tracer any errors from a resolver', async () => {
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
      return Promise.reject(new Error('my custom error'));
    };

    const resolvers = {
      person: getPerson
    };

    const server = Hapi.server();
    await server.register({ plugin: Traci, options: { tracer: new MockTracer() } });
    await server.register({ plugin: Graphi, options: { schema, resolvers } });
    await server.initialize();

    const url = '/graphql?query=%7B%0A%20%20person(firstname%3A%22tom%22)%20%7B%0A%20%20%20%20lastname%0A%20%20%7D%0A%7D';
    const res = await server.inject({ method: 'GET', url });
    expect(res.statusCode).to.equal(200);
    expect(res.result.errors).to.exist();
    const report = server.tracer.report();
    const span = report.spans.find((span) => {
      return span._operationName === 'graphql_request';
    });
    expect(span).to.exist();
    expect(span._logs[1].fields.event).to.equal('error');
  });

  it('will provide a friendly error when the graphql query is incorrect', async () => {
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
      return { firstname: '', lastname: 'jean', email: 'what' };
    };

    const resolvers = {
      person: getPerson
    };

    const server = Hapi.server();
    await server.register({ plugin: Graphi, options: { schema, resolvers } });
    await server.initialize();

    const payload = { query: 'query { person(firstname: "billy) { lastname, email } }' };
    const res = await server.inject({ method: 'POST', url: '/graphql', payload });
    expect(res.statusCode).to.equal(400);
    expect(res.payload).to.contain('Unterminated string');
  });

  it('will handle graphql POST requests with query using GraphQL schema objects', async () => {
    const schema = new GraphQL.GraphQLSchema({
      query: new GraphQL.GraphQLObjectType({
        name: 'RootQueryType',
        fields: {
          person: {
            type: GraphQL.GraphQLString,
            args: { firstname: { type: GraphQL.GraphQLString } },
            resolve: (rootValue, args) => {
              expect(args.firstname).to.equal('billy');
              return 'jean';
            }
          }
        }
      })
    });

    const server = Hapi.server();
    await server.register({ plugin: Graphi, options: { schema } });
    await server.initialize();

    const payload = { query: 'query { person(firstname: "billy") }' };
    const res = await server.inject({ method: 'POST', url: '/graphql', payload });
    expect(res.statusCode).to.equal(200);
    expect(res.result.data.person).to.equal('jean');
  });

  it('will handle graphql POST requests with mutations', async () => {
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
      return { firstname: 'billy', lastname: 'jean' };
    };

    const createPerson = function (args, request) {
      expect(args.firstname).to.equal('billy');
      expect(args.lastname).to.equal('jean');
      expect(request.path).to.equal('/graphql');
      return { firstname: 'billy', lastname: 'jean' };
    };

    const resolvers = {
      createPerson,
      person: getPerson
    };

    const server = Hapi.server();
    await server.register({ plugin: Graphi, options: { schema, resolvers } });
    await server.initialize();

    const payload = { query: 'mutation { createPerson(firstname: "billy", lastname: "jean") { lastname } }' };
    const res = await server.inject({ method: 'POST', url: '/graphql', payload });
    expect(res.statusCode).to.equal(200);
    expect(res.result.data.createPerson.lastname).to.equal('jean');
  });

  it('will handle graphql POST requests with mutations served from mutation routes', async () => {
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
      return { firstname: 'billy', lastname: 'jean' };
    };

    const resolvers = {
      person: getPerson
    };

    const server = Hapi.server();
    await server.register({ plugin: Graphi, options: { schema, resolvers } });

    server.route({
      method: 'POST',
      path: '/createPerson',
      config: {
        tags: ['graphql'],
        handler: (request, h) => {
          expect(request.payload.firstname).to.equal('billy');
          expect(request.payload.lastname).to.equal('jean');
          return { firstname: 'billy', lastname: 'jean' };
        }
      }
    });

    await server.initialize();
    const payload = { query: 'mutation { createPerson(firstname: "billy", lastname: "jean") { lastname } }' };
    const res = await server.inject({ method: 'POST', url: '/graphql', payload });
    expect(res.statusCode).to.equal(200);
    expect(res.result.data.createPerson.lastname).to.equal('jean');
  });

  it('won\'t serve external HTTP requests to graphql method handlers', async () => {
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
      return { firstname: 'billy', lastname: 'jean' };
    };

    const resolvers = {
      person: getPerson
    };

    const server = Hapi.server({ port: 0 });
    await server.register({ plugin: Graphi, options: { schema, resolvers } });

    server.route({
      method: 'graphql',
      path: '/createPerson',
      handler: (request, h) => {
        expect(request.payload.firstname).to.equal('billy');
        expect(request.payload.lastname).to.equal('jean');
        return { firstname: 'billy', lastname: 'jean' };
      }
    });

    await server.start();

    const payload = { firstname: 'billy', lastname: 'jean' };
    const res = await Wreck.request('GRAPHQL', `http://0.0.0.0:${server.info.port}/createPerson`, { payload });
    expect(res.statusCode).to.equal(400);
    await server.stop();
  });

  it('will handle graphql requests to resolver routes when configured with prefix', async () => {
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
      return { firstname: 'billy', lastname: 'jean' };
    };

    const resolvers = {
      person: getPerson
    };

    const server = Hapi.server();
    await server.register({ plugin: Graphi, options: { schema, resolvers }, routes: { prefix: '/test' } });

    server.route({
      method: 'graphql',
      path: '/createPerson',
      handler: (request, h) => {
        expect(request.payload.firstname).to.equal('billy');
        expect(request.payload.lastname).to.equal('jean');
        return { firstname: 'billy', lastname: 'jean' };
      }
    });

    await server.initialize();
    const payload = { query: 'mutation { createPerson(firstname: "billy", lastname: "jean") { lastname } }' };
    const res = await server.inject({ method: 'POST', url: '/test/graphql', payload });
    expect(res.statusCode).to.equal(200);
    expect(res.result.data.createPerson.lastname).to.equal('jean');
  });

  it('will handle graphql requests to resolver routes inside a plugin when configured with prefix', async () => {
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
      return { firstname: 'billy', lastname: 'jean' };
    };

    const resolvers = {
      person: getPerson
    };

    const server = Hapi.server();
    await server.register({ plugin: Graphi, options: { schema, resolvers }, routes: { prefix: '/test' } });

    const plugin = {
      name: 'test',
      version: '0.0.0',
      register: (server) => {
        server.route({
          method: 'graphql',
          path: '/createPerson',
          handler: (request, h) => {
            expect(request.payload.firstname).to.equal('billy');
            expect(request.payload.lastname).to.equal('jean');
            return { firstname: 'billy', lastname: 'jean' };
          }
        });
      }
    };

    await server.register({ plugin, routes: { prefix: '/foo' } });

    await server.initialize();
    const payload = { query: 'mutation { createPerson(firstname: "billy", lastname: "jean") { lastname } }' };
    const res = await server.inject({ method: 'POST', url: '/test/graphql', payload });
    expect(res.statusCode).to.equal(200);
    expect(res.result.data.createPerson.lastname).to.equal('jean');
  });

  it('will error with requests that include unknown directives', async () => {
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
      return { firstname: '', lastname: 'jean' };
    };

    const resolvers = {
      person: getPerson
    };

    const server = Hapi.server();
    await server.register({ plugin: Graphi, options: { schema, resolvers } });
    await server.initialize();

    const payload = { query: 'query { person(firstname: "billy") { lastname @foo(min: 2) } }' };
    const res = await server.inject({ method: 'POST', url: '/graphql', payload });
    expect(res.statusCode).to.equal(400);
    expect(res.result.message).to.contain('Unknown directive');
  });

  it('will handle graphql GET requests with invalid variables', async () => {
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
      return Promise.resolve({ firstname: 'tom', lastname: 'arnold' });
    };

    const resolvers = {
      person: getPerson
    };

    const server = Hapi.server();
    await server.register({ plugin: Graphi, options: { schema, resolvers } });
    await server.initialize();

    const url = '/graphql?query=%7B%0A%20%20person(firstname%3A%22tom%22)%20%7B%0A%20%20%20%20lastname%0A%20%20%7D%0A%7D&variables=invalid';
    const res = await server.inject({ method: 'GET', url });
    expect(res.statusCode).to.equal(400);
  });

  it('will wrap 400 errors', async () => {
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
      return Promise.resolve({ firstname: 'tom', lastname: 'arnold' });
    };

    const resolvers = {
      person: getPerson
    };

    const server = Hapi.server();
    await server.register({ plugin: Graphi, options: { schema, resolvers } });
    await server.initialize();

    const url = '/graphql?query={}';
    const res = await server.inject({ method: 'GET', url });
    expect(res.statusCode).to.equal(400);
  });

  it('allows errors to be formatted', async () => {
    const schema = `
      type Person {
        firstname: String!
        lastname: String!
      }

      type Query {
        person: Person!
      }
    `;

    const getPerson = function (args, request) {
      const error = new Error('my silly error');
      error.id = 'my id';
      throw error;
    };

    const resolvers = {
      person: getPerson
    };

    const formatError = function (error) {
      expect(error.originalError.message).to.equal('my silly error');
      expect(error.originalError.id).to.equal('my id');
      error.originalError.custom = 'field';
      return error.originalError;
    };

    const server = Hapi.server();
    await server.register({ plugin: Graphi, options: { schema, resolvers, formatError } });
    await server.initialize();

    const payload = { query: 'query { person { lastname } }' };
    const res = await server.inject({ method: 'POST', url: '/graphql', payload });
    expect(res.statusCode).to.equal(200);
    expect(res.result.errors[0].message).to.equal('my silly error');
    expect(res.result.errors[0].id).to.equal('my id');
    expect(res.result.errors[0].custom).to.equal('field');
  });

  it('will log result with errors property', async () => {
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
      return { errors: [new Error()] };
    };

    const resolvers = {
      person: getPerson
    };

    const server = Hapi.server();
    await server.register({ plugin: Graphi, options: { schema, resolvers } });
    await server.initialize();

    const url = '/graphql?query=%7B%0A%20%20person(firstname%3A%22tom%22)%20%7B%0A%20%20%20%20lastname%0A%20%20%7D%0A%7D&variables=%7B%22hi%22%3A%20true%7D';
    await server.inject({ method: 'GET', url });
  });

  it('will wrap errors with a promise resolver', async () => {
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
      return Promise.reject(new Error('my custom error'));
    };

    const resolvers = {
      person: getPerson
    };

    const server = Hapi.server();
    await server.register({ plugin: Graphi, options: { schema, resolvers } });
    await server.initialize();

    const url = '/graphql?query=%7B%0A%20%20person(firstname%3A%22tom%22)%20%7B%0A%20%20%20%20lastname%0A%20%20%7D%0A%7D';
    const res = await server.inject({ method: 'GET', url });
    expect(res.statusCode).to.equal(200);
    expect(res.result.errors).to.exist();
  });

  it('will wrap errors thrown in resolver', async () => {
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
      throw new Error('my custom error');
    };

    const resolvers = {
      person: getPerson
    };

    const server = Hapi.server();
    await server.register({ plugin: Graphi, options: { schema, resolvers } });
    await server.initialize();

    const url = '/graphql?query=%7B%0A%20%20person(firstname%3A%22tom%22)%20%7B%0A%20%20%20%20lastname%0A%20%20%7D%0A%7D';
    const res = await server.inject({ method: 'GET', url });
    expect(res.statusCode).to.equal(200);
    expect(res.result.errors).to.exist();
  });

  it('will serve the GraphiQL UI', async () => {
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

    const server = Hapi.server();
    await server.register({ plugin: Graphi, options: { schema, resolvers } }, { routes: { prefix: '/test' } });
    await server.initialize();

    const res = await server.inject({ method: 'GET', url: '/test/graphiql' });
    expect(res.statusCode).to.equal(200);
    expect(res.result).to.contain('<html>');
  });

  it('will serve the GraphiQL UI prepopulated with the query', async () => {
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

    const server = Hapi.server();
    await server.register({ plugin: Graphi, options: { schema, resolvers } });
    await server.initialize();

    const res = await server.inject({ method: 'GET', url: '/graphiql?query=%7B%0A%20%20person(firstname%3A%22tom%22)%20%7B%0A%20%20%20%20lastname%0A%20%20%7D%0A%7D&variables=%7B%22hi%22%3A%20true%7D' });
    expect(res.statusCode).to.equal(200);
    expect(res.result).to.contain('person');
  });

  it('can disable GraphiQL UI', async () => {
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

    const server = Hapi.server();
    await server.register({ plugin: Graphi, options: { schema, resolvers, graphiqlPath: false } });
    await server.initialize();

    const res = await server.inject({ method: 'GET', url: '/graphiql' });
    expect(res.statusCode).to.equal(404);
  });

  it('will handle nested queries', async () => {
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

      return Promise.resolve([{ firstname: 'michael', lastname: 'jackson' }]);
    };

    const getPerson = function (args, request) {
      expect(args.firstname).to.equal('billy');
      expect(request.path).to.equal('/graphql');

      return Promise.resolve({ firstname: 'billy', lastname: 'jean', friends: getFriends });
    };

    const resolvers = {
      person: getPerson,
      friends: getFriends
    };

    const server = Hapi.server();
    await server.register({ plugin: Graphi, options: { schema, resolvers } });
    await server.initialize();

    const payload = {
      query: 'query GetPersonsFriend($firstname: String!, $friendsFirstname: String!) { person(firstname: $firstname) { friends(firstname: $friendsFirstname) { lastname } } }',
      variables: { firstname: 'billy', friendsFirstname: 'michael' }
    };
    const res = await server.inject({ method: 'POST', url: '/graphql', payload });
    expect(res.statusCode).to.equal(200);
    expect(res.result.data.person.friends[0].lastname).to.equal('jackson');
  });

  it('will handle invalid queries in POST request', async () => {
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

      return Promise.resolve([{ firstname: 'michael', lastname: 'jackson' }]);
    };

    const getPerson = function (args, request) {
      expect(args.firstname).to.equal('billy');
      expect(request.path).to.equal('/graphql');

      return Promise.resolve({ firstname: 'billy', lastname: 'jean', friends: getFriends });
    };

    const resolvers = {
      person: getPerson,
      friends: getFriends
    };

    const server = Hapi.server();
    await server.register({ plugin: Graphi, options: { schema, resolvers } });
    await server.initialize();

    const payload = {
      query: 'query GetPersonsF} }',
      variables: { firstname: 'billy', friendsFirstname: 'michael' }
    };

    const res = await server.inject({ method: 'POST', url: '/graphql', payload });
    expect(res.statusCode).to.equal(400);
  });

  it('will handle graphql POST request without a payload', async () => {
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
      return { firstname: '', lastname: 'jean', email: 'what' };
    };

    const resolvers = {
      person: getPerson
    };

    const server = Hapi.server();
    await server.register({ plugin: Graphi, options: { schema, resolvers } });
    await server.initialize();

    const res = await server.inject({ method: 'POST', url: '/graphql' });
    expect(res.statusCode).to.equal(400);
  });

  it('will handle graphql OPTIONS request when cors is disabled', async () => {
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
      return { firstname: '', lastname: 'jean', email: 'what' };
    };

    const resolvers = {
      person: getPerson
    };

    const server = Hapi.server();
    await server.register({ plugin: Graphi, options: { schema, resolvers } });
    await server.initialize();

    const res = await server.inject({ method: 'OPTIONS', url: '/graphql' });
    expect(res.statusCode).to.equal(200);
  });


  it('authStrategy false route does not use bearer token', async () => {
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
      return { firstname: '', lastname: 'jean', email: 'what' };
    };

    const resolvers = {
      person: getPerson
    };

    const plugins = [
      { plugin: HapiAuthBearerToken, options: {} },
      { plugin: internals.authTokenStrategy, options: {} },
      { plugin: Graphi, options: { schema, resolvers, authStrategy: false } }
    ];

    const server = Hapi.server();

    await server.register(plugins);
    await server.initialize();

    const payload = { query: 'query { person(firstname: "billy") { lastname, email } }' };
    const res = await server.inject({ method: 'POST', url: '/graphql', payload });

    expect(res.statusCode).to.equal(200);
    expect(res.result.data.person.lastname).to.equal('jean');
  });

  it('authStrategy defaults to false when option is not configured', async () => {
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
      return { firstname: '', lastname: 'jean', email: 'what' };
    };

    const resolvers = {
      person: getPerson
    };

    const plugins = [
      { plugin: HapiAuthBearerToken, options: {} },
      { plugin: internals.authTokenStrategy, options: {} },
      { plugin: Graphi, options: { schema, resolvers } }
    ];

    const server = Hapi.server();

    await server.register(plugins);
    await server.initialize();

    const payload = { query: 'query { person(firstname: "billy") { lastname, email } }' };
    const res = await server.inject({ method: 'POST', url: '/graphql', payload });

    expect(res.statusCode).to.equal(200);
    expect(res.result.data.person.lastname).to.equal('jean');
  });

  it('requests fails without valid auth token', async () => {
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
      return { firstname: '', lastname: 'jean', email: 'what' };
    };

    const resolvers = {
      person: getPerson
    };

    const plugins = [
      { plugin: HapiAuthBearerToken, options: {} },
      { plugin: internals.authTokenStrategy, options: {} },
      { plugin: Graphi, options: { schema, resolvers, authStrategy: 'test' } }
    ];

    const server = Hapi.server();

    await server.register(plugins);
    await server.initialize();

    const payload = { query: 'query { person(firstname: "billy") { lastname, email } }' };
    const res = await server.inject({ method: 'POST', url: '/graphql', payload });

    expect(res.statusCode).to.equal(401);
    expect(res.result.message).to.equal('Missing authentication');
  });

  it('request succeeds with valid auth token', async () => {
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
      return { firstname: '', lastname: 'jean', email: 'what' };
    };

    const resolvers = {
      person: getPerson
    };

    const plugins = [
      { plugin: HapiAuthBearerToken, options: {} },
      { plugin: internals.authTokenStrategy, options: {} },
      { plugin: Graphi, options: { schema, resolvers, authStrategy: 'test' } }
    ];

    const server = Hapi.server();

    await server.register(plugins);
    await server.initialize();

    const payload = { query: 'query { person(firstname: "billy") { lastname, email } }' };
    const res = await server.inject({ method: 'POST', url: '/graphql', headers: { authorization: 'Bearer 12345678' }, payload });

    expect(res.statusCode).to.equal(200);
    expect(res.result.data.person.lastname).to.equal('jean');
  });

  it('request for /graphiql succeeds with valid auth token', async () => {
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

    const plugins = [
      { plugin: HapiAuthBearerToken, options: {} },
      { plugin: internals.authTokenStrategy, options: {} },
      { plugin: Graphi, options: { schema, graphiAuthStrategy: 'test' } }
    ];

    const server = Hapi.server();

    await server.register(plugins);
    await server.initialize();

    const res1 = await server.inject({ method: 'GET', url: '/graphiql', headers: { authorization: 'Bearer 12345678' } });
    expect(res1.statusCode).to.equal(200);
    expect(res1.result).to.contain('<html>');

    const res2 = await server.inject({ method: 'GET', url: '/graphiql' });
    expect(res2.statusCode).to.equal(401);
  });

  it('route resolvers support separate auth schemes', async () => {
    const schema = `
      type Person {
        firstname: String!
        lastname: String!
        email: String!
      }

      type Query {
        person(firstname: String!): Person!
        human(firstname: String!): Person!
      }
    `;

    const plugins = [
      { plugin: HapiAuthBearerToken, options: {} },
      { plugin: internals.authTokenStrategy, options: {} },
      { plugin: Graphi, options: { schema, authStrategy: false } }
    ];

    const server = Hapi.server();
    await server.register(plugins);

    server.route({
      method: 'graphql',
      path: '/person',
      config: {
        auth: 'test',
        handler: (request, h) => {
          expect(request.payload.firstname).to.equal('billy');
          return { firstname: '', lastname: 'jean', email: 'what' };
        }
      }
    });

    server.route({
      method: 'graphql',
      path: '/human',
      config: {
        auth: false,
        handler: (request, h) => {
          expect(request.payload.firstname).to.equal('billy');
          return { firstname: 'foo', lastname: 'bar', email: 'what' };
        }
      }
    });

    await server.initialize();

    const payload1 = { query: 'query { person(firstname: "billy") { lastname, email } }' };
    const res1 = await server.inject({ method: 'POST', url: '/graphql', headers: { authorization: 'Bearer 12345678' }, payload: payload1 });
    expect(res1.statusCode).to.equal(200);
    expect(res1.result.data.person.lastname).to.equal('jean');

    const res2 = await server.inject({ method: 'POST', url: '/graphql', payload: payload1 });
    expect(res2.statusCode).to.equal(200);
    expect(res2.result.errors[0].message).to.equal('Missing authentication');

    const payload2 = { query: 'query { human(firstname: "billy") { lastname, email } }' };
    const res3 = await server.inject({ method: 'POST', url: '/graphql', payload: payload2 });
    expect(res3.statusCode).to.equal(200);
    expect(res3.result.data.human.lastname).to.equal('bar');
  });
});

describe('server.registerSchema()', () => {
  it('will overwrite an existing schema', async () => {
    const getPerson = function (args, request) {
      expect(args.firstname).to.equal('billy');
      expect(request.path).to.equal('/graphql');
      return { firstname: 'billy', lastname: 'jean' };
    };

    const createPerson = function (args, request) {
      expect(args.firstname).to.equal('billy');
      expect(args.lastname).to.equal('jean');
      expect(request.path).to.equal('/graphql');
      return { firstname: 'billy', lastname: 'jean' };
    };

    const schema1 = `
      type Person {
        id: ID!
        firstname: String!
        lastname: String!
      }

      type Query {
        person(firstname: String!): Person!
      }
    `;

    const schema2 = `
      type Person {
        id: ID!
        firstname: String!
        lastname: String!
      }

      type Mutation {
        createPerson(firstname: String!, lastname: String!): Person!
      }

      type Query {
        people: [Person]
      }
    `;

    const resolvers1 = {
      person: getPerson,
      people: () => {}
    };

    const resolvers2 = {
      createPerson
    };

    const server = Hapi.server();
    await server.register({ plugin: Graphi, options: { schema: schema1, resolvers: resolvers1 } });
    server.registerSchema({ schema: schema2, resolvers: resolvers2 });
    await server.initialize();

    const payload1 = { query: 'mutation { createPerson(firstname: "billy", lastname: "jean") { lastname } }' };
    const res1 = await server.inject({ method: 'POST', url: '/graphql', payload: payload1 });
    expect(res1.statusCode).to.equal(200);
    expect(res1.result.data.createPerson.lastname).to.equal('jean');

    const payload2 = { query: 'query { person(firstname: "billy") { lastname } }' };
    const res2 = await server.inject({ method: 'POST', url: '/graphql', payload: payload2 });
    expect(res2.statusCode).to.equal(400);
  });

  it('will register a new schema', async () => {
    const getPeople = function (args, request) {
      return [{ firstname: 'billy', lastname: 'jean' }];
    };

    const schema = `
      type Person {
        id: ID!
        firstname: String!
        lastname: String!
      }

      type Query {
        people: [Person]
      }
    `;

    const resolvers = {
      people: getPeople
    };

    const server = Hapi.server({ debug: { request: ['error'] } });
    await server.register({ plugin: Graphi });
    server.registerSchema({ schema: schema, resolvers: resolvers });
    await server.initialize();

    const payload = { query: 'query { people { lastname } }' };
    const res = await server.inject({ method: 'POST', url: '/graphql', payload });
    expect(res.statusCode).to.equal(200);
    expect(res.result.data.people[0].lastname).to.equal('jean');
  });
});

// auth token strategy plugin

const defaultValidateFunc = (request, token) => {
  return {
    isValid: token === '12345678',
    credentials: { token }
  };
};

internals.authTokenStrategy = {
  name: 'authtoken',
  version: '1.0.0',
  description: 'register hapi-auth-bearer-token strategy.',
  register: function (server, options) {
    server.auth.strategy('test', 'bearer-access-token', {
      validate: defaultValidateFunc
    });
    server.auth.default('test');
  }
};
