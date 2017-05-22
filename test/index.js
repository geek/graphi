'use strict';


const Code = require('code');
const Hapi = require('hapi');
const Lab = require('lab');
const Graphi = require('../');


const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;
const expect = Code.expect;


describe('graphi', () => {
  it('can be registered with hapi', (done) => {
    const server = new Hapi.Server();
    server.connection();
    server.register(Graphi, (err) => {
      expect(err).to.not.exist();
      done();
    });
  });

  it('will handle graphql requests', (done) => {
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

    const functions = {
      person: getPerson
    };

    const server = new Hapi.Server();
    server.connection();
    server.register({ register: Graphi, options: { schema, functions } }, (err) => {
      expect(err).to.not.exist();
      const url = '/graphql?query=%7B%0A%20%20person(firstname%3A%22tom%22)%20%7B%0A%20%20%20%20lastname%0A%20%20%7D%0A%7D';

      server.inject({ method: 'GET', url }, (res) => {
        expect(res.statusCode).to.equal(200);
        const result = JSON.parse(res.result);
        expect(result.data.person.lastname).to.equal('arnold');
        done();
      });
    });
  });
});
