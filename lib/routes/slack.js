'use strict';

const Boom = require('boom');
const _ = require('lodash');

const routesSlack = {
  name: 'routes-slack',
  version: '1.0.0',
  register: async function (server, options) {
    const client = server.plugins.pg.client;

    server.route({
      method: 'POST',
      path: '/slack/challenge',
      config: { 
        auth: false,
        description: 'Slack bot event hook'
      },
      handler: async (request, h) => {
        const p = request.payload;
        console.log(p);
        if (p.challenge) {
          return p.challenge;
        }
        return null;
      }
    });
  }
}

module.exports = routesSlack;
