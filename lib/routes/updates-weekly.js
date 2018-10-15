'use strict';

const Boom = require('boom');
const Joi = require('joi');
const moment = require('moment');
const _ = require('lodash');

const routesUpdates = {
  name: 'routes-updates-weekly',
  version: '1.0.0',
  register: async function (server, options) {
    const client = server.plugins.pg.client;

    server.route({
      method: 'GET',
      path: '/updates/weekly',
      config: {
        auth: 'jwt',
        description: 'Get weekly updates between a given date range'
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
              wu.date_string date_string,
              wu.id updateid,
              body,
              wt.id tagid,
              tag
            FROM
              weekly_updates wu
            LEFT JOIN
              weekly_tags wt
            ON
              wt.updateid = wu.id
            WHERE
              wu.userid = $1 and
              wu.date_string between $2 and $3
            ORDER BY
              wu.date_string,
              wu.id,
              wt.tag
          `, [userid, startDate, endDate]);
          return res.rows;
        } catch (e) {
          console.log(e);
          return Boom.badImplementation('Error getting weekly updates');
        }
      }
    });

    server.route({
      method: 'POST',
      path: '/updates/weekly/{weekStr}',
      config: {
        auth: 'jwt',
        description: 'Overwrite all weekly updates of weekStr'
      },
      handler: async (request, h) => {
        const userid = request.auth.credentials.userid;
        const p = request.payload;
        const { weekStr } = request.params;
        try {
          await client.query('BEGIN');
          await client.query(`
            DELETE FROM weekly_updates 
            WHERE userid = $1 AND date_string=$2;
          `, [userid, weekStr]);
          await client.query(`
            DELETE FROM weekly_tags
            WHERE userid = $1 AND date_string=$2;
          `, [userid, weekStr]);
          for(let update of p) {
            const res = await client.query(`
              INSERT INTO weekly_updates(userid, date_string, body)
              VALUES($1, $2, $3) RETURNING id;
            `, [userid, weekStr, update.body]);
            const updateid = res.rows[0].id;
            for(let tag of update.tags) {
              await client.query(`
                INSERT INTO weekly_tags(userid, updateid, date_string, tag)
                VALUES($1, $2, $3, $4);
              `, [userid, updateid, weekStr, tag.tag]);
            }
          }
          await client.query('COMMIT');
          return { success: true };
        } catch (e) {
          await client.query('ROLLBACK');
          console.log(e);
          return Boom.badImplementation('Error creating new weekly update.');
        }
      }
    });
  }
};

module.exports = routesUpdates;