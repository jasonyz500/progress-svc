'use strict';

const Boom = require('boom');
const Joi = require('joi');
const moment = require('moment');
const _ = require('lodash');

const routesEntries = {
  name: 'routes-entries',
  version: '1.0.0',
  register: async function (server, options) {
    const client = server.plugins.pg.client;

    server.route({
      method: 'POST',
      path: '/entries/daily/new',
      config: {
        auth: 'jwt',
        description: 'Add a new daily entry'
      },
      handler: async (request, h) => {
        const userid = request.auth.credentials.userid;
        const p = request.payload;
        // start transaction
        try {
          await client.query('BEGIN');
          let res = await client.query(`
            INSERT INTO daily_entries(userid, date_string, mood_score, mood_reason)
            VALUES($1, $2, $3, $4) RETURNING id;
          `, [userid, p.date_string, p.mood_score, p.mood_reason]);
          const entryid = res.rows[0].id;
          // if there are updates in this request, fill them in too
          if(p.updates) {
            for(let update of p.updates) {
              res = await client.query(`
                INSERT INTO daily_updates(userid, entryid, date_string, body)
                VALUES($1, $2, $3, $4) RETURNING id;
              `, [userid, entryid, p.date_string, update.body]);
              const updateid = res.rows[0].id;
              for(let tag of update.tags) {
                await client.query(`
                  INSERT INTO daily_tags(userid, updateid, date_string, tag)
                  VALUES($1, $2, $3, $4);
                `, [userid, updateid, p.date_string, tag]);
              }
            }
          }
          await client.query('COMMIT');
          return { entryid };
        } catch (e) {
          await client.query('ROLLBACK');
          console.log(e);
          return Boom.badImplementation('Error creating new entry.');
        }
      }
    });

    server.route({
      method: ['PUT', 'PATCH'],
      path: '/entries/{id}',
      config: {
        auth: 'jwt',
        description: 'Update an entry by ID'
      },
      handler: async (request, h) => {
        const userId = request.auth.credentials.userid;
      }
    })
  }
};

module.exports = routesEntries;