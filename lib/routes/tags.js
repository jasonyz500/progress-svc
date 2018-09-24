'use strict';

const bcrypt = require('bcrypt');
const Boom = require('boom');

const routesTags = {
  name: 'routes-tags',
  version: '1.0.0',
  register: async function (server, options) {
    const client = server.plugins.pg.client;

    server.route({
      method: 'GET',
      path: '/tags',
      config: { 
        auth: 'jwt',
        description: 'Get all tags for a user'
      },
      handler: async (request, h) => {
        const userid = request.auth.credentials.userid;
        // todo: after setting up weekly tags, modify this query
        try {
          const res = await client.query(`
            SELECT
              tag
            FROM
              daily_tags
            WHERE
              userid = $1
          `, [userid]);
          return res.rows;
        } catch (e) {
          console.log(e);
          return Boom.badImplementation('Error getting tags');
        }
      }
    });
  }
}

module.exports = routesTags;
