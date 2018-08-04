'use strict';

const bcrypt = require('bcrypt');
const Boom = require('boom');
const jwt = require('hapi-auth-jwt2');
const jsonwebtoken = require('jsonwebtoken');
const moment = require('moment');

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
      path: '/login',
      config: { auth: false },
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
      path: '/users/new',
      config: { auth: false },
      handler: async (request, h) => {
        const { email, password } = request.payload;
        const user = await client.query(
          'select * from users where email = $1', [email]
        );
        if (user.rowCount > 0) {
          return Boom.unauthorized('Email already registered');
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
};

function signToken(userid) {
  return jsonwebtoken.sign({
    userid: userid
  }, process.env.JWT_SECRET, {expiresIn: '144h'});
}

module.exports = authJwt;