'use strict';

const bcrypt = require('bcrypt');
const Boom = require('boom');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

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
              encryption_hint
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

    server.route({
      method: 'POST',
      path: '/users/reset_password',
      config: {
        auth: false,
        description: 'Generate a reset password token and send to email.'
      },
      handler: async (request, h) => {
        const { email } = request.payload;
        const user = await client.query(
          'select * from users where email = $1', [email]
        );
        if (user.rowCount === 0) {
          console.log("couldn't find user");
          return {};
        }
        const userId = user.rows[0].id;
        const tokenBytes = await crypto.randomBytes(20);
        const token = tokenBytes.toString('hex');
        try {
          const timeLimitMinutes = 30;
          const res = await client.query(`
            UPDATE users
            SET password_reset_token = $1, password_reset_token_expires = $2
            WHERE id = $3
          `, [token, Date.now() + 1 * timeLimitMinutes * 60 * 1000, userId]);
          // send email
          const link = `http://localhost:3001/login/reset_password?token=${token}`;
          const mailOptions = {
            from : '"Progress App" <noreply@nozomy.com>',
            to: email,
            subject: 'Password Reset',
            text: `Follow this link to reset your password: ${link}. The link expires in ${timeLimitMinutes} minutes.
              If you did not request this email, your account is still safe and no action is required at this time.`
          }
          return {};
        } catch (e) {
          console.log(e);
          return boom.badImplementation('Server error');
        }
      }
    });
  }
}

module.exports = routesUsers;
