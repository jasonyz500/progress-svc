'use strict';

const bcrypt = require('bcrypt');
const Boom = require('boom');
const jwt = require('hapi-auth-jwt2');
const jsonwebtoken = require('jsonwebtoken');
const moment = require('moment');
const nodemailer = require('nodemailer');

const authJwt = {
  name: 'auth-jwt',
  version: '1.0.0',
  register: async function (server, options) {
    const client = server.plugins.pg.client;
    await server.register(jwt);

    const validate = async function (decoded, request) {
      const user = await client.query(
        'select * from users where id = $1', [decoded.userid]
      );
      if (user.rowCount == 1 && decoded.exp >= moment().unix()) {
        return { isValid: true };
      }
      return { isValid: false };
    }

    server.auth.strategy('jwt', 'jwt', {
      key: process.env.JWT_SECRET,
      validate: validate,
      verifyOptions: {algorithms: [ 'HS256' ]}
    });

    server.auth.default('jwt');

    server.route({
      method: 'POST',
      path: '/auth/login',
      config: { 
        auth: false,
        description: 'Auth function to log in a user on the client side'
      },
      handler: async (request, h) => {
        const { email, password } = request.payload;
        const res = await client.query(
          'select * from users where email = $1', [email]
        );
        if (res.rowCount != 1) {
          return Boom.unauthorized('Email or Password invalid');
        }
        const loginSuccess = await bcrypt.compare(password, res.rows[0].password);
        if (!loginSuccess) {
          return Boom.unauthorized('Email or Password invalid');
        }
        return signToken(res.rows[0].id);
      }
    });

    server.route({
      method: 'POST',
      path: '/auth/change_password',
      config: {
        auth: 'jwt',
        description: 'Edit password'
      },
      handler: async (request, h) => {
        const userid = request.auth.credentials.userid;
        const { currentPassword, newPassword } = request.payload;
        const res = await client.query(`
          SELECT password FROM users WHERE id = $1
        `, [userid]);
        const compareSuccess = await bcrypt.compare(currentPassword, res.rows[0].password);
        if (!compareSuccess) {
          return Boom.unauthorized('Current password is incorrect');
        }
        const hash = await bcrypt.hash(newPassword, 10);
        await client.query("UPDATE users SET password = $1 WHERE id = $2", [hash, userid]);
        return { success: true };
      }
    });

    server.route({
      method: 'POST',
      path: '/auth/reset_password',
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
        const cipher = crypto.createCipher('aes-256-ctr', process.env.PASSWORD_RECOVERY_SECRET);
        const tokenHash = cipher.update(token, 'utf8', 'hex') + cipher.final('hex');
        try {
          const timeLimitMinutes = 30;
          const res = await client.query(`
            UPDATE users
            SET password_reset_token = $1, password_reset_token_expires = $2
            WHERE id = $3
          `, [tokenHash, Date.now() + 1 * timeLimitMinutes * 60 * 1000, userId]);
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

    server.route({
      method: 'POST',
      path: '/auth/reset_password_token',
      config: {
        auth: false,
        description: 'Reset password using token generated and sent to email.'
      },
      handler: async (request, h) => {
        const { token, newPassword } = request.payload;
        const cipher = crypto.createCipher('aes-256-ctr', process.env.PASSWORD_RECOVERY_SECRET);
        const tokenHash = cipher.update(token, 'utf8', 'hex') + cipher.final('hex');
        const res = await client.query(
          'select * from users where password_reset_token = $1 and password_reset_token_expires <= $2',
          [tokenHash, Date.now()]
        );
        if (res.rowCount != 1) {
          return Boom.unauthorized('There was a problem with this access token. Please try generating a new one.');
        }
        const hash = await bcrypt.hash(newPassword, 10);
        try {
          await client.query('BEGIN');
          res = await client.query(`
            UPDATE users
            SET password = $1, password_reset_token = NULL, passsword_reset_token_expires = NULL
            WHERE id = $2;
          `, [hash, userId]);
          await client.query('COMMIT');
          return { success: true }
        } catch (e) {
          await client.query('ROLLBACK');
          console.log(e);
          return Boom.badImplementation('Failed to update password');
        }
      }
    });
  }
};

function signToken(userid) {
  return jsonwebtoken.sign({
    userid: userid
  }, process.env.JWT_SECRET, {expiresIn: '144h'});
}

module.exports = authJwt;