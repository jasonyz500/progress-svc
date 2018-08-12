'use strict';

const Boom = require('boom');
const Joi = require('joi');
const moment = require('moment');
const _ = require('lodash');

const routesEntries = {
  name: 'routes-entries-daily',
  version: '1.0.0',
  register: async function (server, options) {
    const client = server.plugins.pg.client;

    server.route({
      method: 'GET',
      path: '/entries/daily',
      config: {
        auth: 'jwt',
        description: 'Get daily entries between a given date range'
      },
      handler: async (request, h) => {
        const userid = request.auth.credentials.userid;
        const { startDate, endDate } = request.query;
        if(!startDate || !endDate) {
          return Boom.badRequest('Missing start or end date in query');
        }
        try {
          const res = await client.query(`
            SELECT *
            FROM
              daily_entries de
            JOIN
              daily_updates du
            ON 
              du.entryid = de.id
            JOIN
              daily_tags dt
            ON
              dt.updateid = du.id
            WHERE
              de.userid = $1 and
              de.date_string between $2 and $3
          `, [userid, startDate, endDate]);
          // transform result in row format to correct return format
          /*
          return should be:
          {
            'date': {
              id: x,
              mood_score: x,
              mood_reason: x,
              updates: [
                {
                  id: x,
                  body: x,
                  tags: [{ id: x, tag: x }, {...}]
                }, {...}
              ]  
            }
          }
          */

          return res.rows;
        } catch (e) {
          console.log(e);
          return Boom.badImplementation('Error getting daily entries');
        }
      }
    });

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
                  INSERT INTO daily_tags(userid, entryid, updateid, date_string, tag)
                  VALUES($1, $2, $3, $4, $5);
                `, [userid, entryid, updateid, p.date_string, tag]);
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
    });
  }
};

module.exports = routesEntries;