'use strict';

const bcrypt = require('bcrypt');
const Boom = require('boom');

const routesUsers = {
  name: 'routes-users',
  version: '1.0.0',
  register: async function (server, options) {
    server.route({
      method: 'POST',
      path: '/users/new',
      config: { 
        auth: false,
        description: 'Register a new user'
      },
      handler: async (request, h) => {
        const { email, password } = request.payload;
        const user = await client.query(
          'select * from users where email = $1', [email]
        );
        if (user.rowCount > 0) {
          return Boom.unauthorized('Email already registered');
        }
        // only allow users whose emails are in whitelist
        const whitelist = await client.query(
          'select email from new_user_whitelist where email = $1', [email]
        );
        if (user.rowCount != 1) {
          return Boom.unauthorized('Email not on whitelist');
        }
        const hash = await bcrypt.hash(password, 10);
        const result = await client.query(
          'insert into users(email, password) values ($1, $2) returning *',
          [email, hash]
        );
        return(result.rows[0]);
      }
    });
  }
}

module.exports = routesUsers;