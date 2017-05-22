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
});
