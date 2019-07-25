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

    server.route({
      method: 'POST',
      path: '/slack/ids',
      config: {
        auth: 'jwt',
        description: 'Add user and team IDs for slack'
      },
      handler: async (request, h) => {
        const userid = request.auth.credentials.userid;
        const p = request.payload;
        const slackUserId = p.user.id;
        const slackTeamId = p.team.id;
        try {
          await client.query('BEGIN');
          await client.query(`
            UPDATE users
            SET (slack_userid, slack_teamid) = ($1, $2)
            WHERE id=$3
          `, [slackUserId, slackTeamId, teamIduserid]);
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK');
          console.log(e);
          return Boom.badImplementation('Error adding slack ID information');
        }
      }
    })
  }
}

module.exports = routesSlack;
