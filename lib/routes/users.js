'use strict';

const bcrypt = require('bcrypt');
const Boom = require('boom');
const crypto = require('crypto');
const jsonwebtoken = require('jsonwebtoken');

const routesUsers = {
  name: 'routes-users',
  version: '1.0.0',
  register: async function (server, options) {
    const client = server.plugins.pg.client;

    server.route({
      method: 'POST',
      path: '/users/new',
      config: { 
        auth: false,
        description: 'Register a new user'
      },
      handler: async (request, h) => {
        const { email, password, is_encryption_enabled, encryption_hint } = request.payload;
        const user = await client.query(
          'select * from users where email = $1', [email]
        );
        if (user.rowCount > 0) {
          return Boom.unauthorized('Email already registered');
        }
        // only allow users whose emails are in whitelist
        const whitelist = await client.query(
          'select * from new_user_whitelist where email = $1', [email]
        );
        if (whitelist.rowCount != 1) {
          return Boom.unauthorized('Email not on whitelist');
        }
        const hash = await bcrypt.hash(password, 10);
        try {
          await client.query('BEGIN');
          const result = await client.query(`
            insert into users(email, password, is_encryption_enabled, encryption_hint) values ($1, $2, $3, $4) returning *
          `, [email, hash, is_encryption_enabled, encryption_hint]
          );
          await client.query('COMMIT');
          return signToken(result.rows[0]);
        } catch (e) {
          await client.query('ROLLBACK');
          console.log(e);
          return Boomm.badImplementation('Failed to create new user');
        }
      }
    });

    server.route({
      method: 'GET',
      path: '/users/profile',
      config: {
        auth: 'jwt',
        description: 'Get information for current signed in user'
      },
      handler: async (request, h) => {
        const userid = request.auth.credentials.userid;
        try {
          const res = await client.query(`
            SELECT 
              email,
              is_encryption_enabled,
              encryption_hint,
              slack_userid
            FROM
              users
            WHERE
              id = $1;
          `, [userid]);
          return res.rows[0];
        } catch (e) {
          console.log(e);
          return Boom.badImplementation('Error getting data for user.');
        }
      }
    });
  }
}

function signToken(data) {
  return jsonwebtoken.sign({
    userid: data.id,
    email: data.email,
    is_encryption_enabled: data.is_encryption_enabled,
    encryption_hint: data.encryption_hint
  }, process.env.JWT_SECRET, {expiresIn: '144h'});
}

module.exports = routesUsers;
