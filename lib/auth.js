'use strict';

const bcrypt = require('bcrypt');
const Boom = require('boom');
const jwt = require('hapi-auth-jwt2');
const jsonwebtoken = require('jsonwebtoken');
const moment = require('moment');
const crypto = require('crypto');
const sendgrid = require('sendgrid');
const sg = sendgrid(process.env.SENDGRID_API_KEY);
const sghelper = sendgrid.mail;

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
        return signToken(res.rows[0]);
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
          return { success: true };
        }
        const userId = user.rows[0].id;

        // generate a token and encrypt it
        const token = crypto.randomBytes(10).toString('hex');
        const cipher = crypto.createCipher('aes192', process.env.PASSWORD_RECOVERY_SECRET);
        const tokenHash = cipher.update(token, 'utf8', 'hex') + cipher.final('hex');
        try {
          const timeLimitMinutes = 30;
          await client.query(`
            UPDATE users
            SET password_reset_token = $1, password_reset_token_expires = $2
            WHERE id = $3
          `, [tokenHash, Math.floor(Date.now()/1000) + 60*timeLimitMinutes, userId]);

          // set up email content
          const link = `http://localhost:3001/password_reset/token/${token}`;
          const fromEmail = new sghelper.Email('noreply@progressapp.io');
          const toEmail = new sghelper.Email(email);
          const subject = 'Progress App: Password Reset';
          const body = new sghelper.Content(
            'text/plain', 
            `Follow this link to reset your password: ${link}. Your token expires in ${timeLimitMinutes} minutes.
            If you did not request this email, your account is still safe and no action is required at this time.`
          )
          const emailObj = new sghelper.Mail(fromEmail, subject, toEmail, body);

          // send email
          const emailRequest = sg.emptyRequest({
            method: 'POST',
            path: '/v3/mail/send',
            body: emailObj.toJSON()
          });

          await sg.API(emailRequest);
          return { success: true };
        } catch (e) {
          console.log(e);
          return Boom.badImplementation('Server error');
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
        const { token, password } = request.payload;
        const cipher = crypto.createCipher('aes192', process.env.PASSWORD_RECOVERY_SECRET);
        const tokenHash = cipher.update(token, 'utf8', 'hex') + cipher.final('hex');
        const res = await client.query(
          'select * from users where password_reset_token = $1 and password_reset_token_expires >= $2',
          [tokenHash, Math.floor(Date.now()/1000)]
        );
        if (res.rowCount != 1) {
          return Boom.unauthorized('There was a problem with this access token. Please try generating a new one.');
        }
        const userId = res.rows[0].id;
        const hash = await bcrypt.hash(password, 10);
        try {
          await client.query('BEGIN');
          await client.query(`
            UPDATE users
            SET password = $1, password_reset_token = NULL, password_reset_token_expires = NULL
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

function signToken(data) {
  return jsonwebtoken.sign({
    userid: data.id,
    email: data.email,
    is_encryption_enabled: data.is_encryption_enabled
  }, process.env.JWT_SECRET, {expiresIn: '144h'});
}

module.exports = authJwt;