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
            SELECT
              de.id entryid,
              de.date_string date_string,
              mood_score,
              mood_reason,
              du.id updateid,
              body,
              dt.id tagid,
              tag
            FROM
              daily_entries de
            LEFT JOIN
              daily_updates du
            ON 
              du.entryid = de.id
            LEFT JOIN
              daily_tags dt
            ON
              dt.updateid = du.id
            WHERE
              de.userid = $1 and
              de.date_string between $2 and $3
            ORDER BY
              de.date_string,
              du.id,
              dt.tag
          `, [userid, startDate, endDate]);
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
              `, [userid, entryid, updateid, p.date_string, tag.tag]);
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
      method: ['PUT', 'PATCH', 'POST'],
      path: '/entries/daily/{id}',
      config: {
        auth: 'jwt',
        description: 'Update an entry by ID'
      },
      handler: async (request, h) => {
        const userid = request.auth.credentials.userid;
        const p = request.payload;
        // start transaction
        try {
          await client.query('BEGIN');
          let res = await client.query(`
            UPDATE daily_entries SET (mood_score, mood_reason)
            = ($1, $2) WHERE id=$3;
          `, [p.mood_score, p.mood_reason, p.id]);
          // there may be deleted updates
          // to simplify things, always delete all old updates, then add new ones
          for(let update of p.updates) {
            await client.query(`
              DELETE FROM daily_updates WHERE entryid=$1;
            `, [p.id]);
            res = await client.query(`
              INSERT INTO daily_updates(userid, entryid, date_string, body)
              VALUES($1, $2, $3, $4) RETURNING id;
            `, [userid, p.id, p.date_string, update.body]);
            let updateid = res.rows[0].id;
            // also always delete old tags and insert new ones
            for(let tag of update.tags) {
              await client.query(`
                DELETE FROM daily_tags where entryid=$1;
              `, [p.id]);
              await client.query(`
                INSERT INTO daily_tags(userid, entryid, updateid, date_string, tag)
                VALUES($1, $2, $3, $4, $5);
              `, [userid, p.id, updateid, p.date_string, tag.tag]);
            }
          }
          await client.query('COMMIT');
          return { success: true };
        } catch (e) {
          await client.query('ROLLBACK');
          console.log(e);
          return Boom.badImplementation('Error creating new entry.');
        }
      }
    });
  }
};

module.exports = routesEntries;