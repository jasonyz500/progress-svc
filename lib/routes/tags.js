'use strict';

const Boom = require('boom');
const _ = require('lodash');

const routesTags = {
  name: 'routes-tags',
  version: '1.0.0',
  register: async function (server, options) {
    const client = server.plugins.pg.client;

    server.route({
      method: 'GET',
      path: '/tags',
      config: { 
        auth: 'jwt',
        description: 'Get all tags for a user'
      },
      handler: async (request, h) => {
        const userid = request.auth.credentials.userid;
        try {
          const res = await client.query(`
            SELECT
              distinct tag
            FROM (
              SELECT distinct tag as tag from daily_tags WHERE userid = $1
            UNION ALL
              (SELECT distinct tag as tag from weekly_tags WHERE userid = $1)) tags
          `, [userid]);
          return res.rows;
        } catch (e) {
          console.log(e);
          return Boom.badImplementation('Error getting tags');
        }
      }
    });

    server.route({
      method: 'GET',
      path: '/tags/weekly',
      config: {
        auth: 'jwt',
        description: 'Get all tags organized by date range'
      },
      handler: async (request, h) => {
        const userid = request.auth.credentials.userid;
        const { startDate, endDate } = request.query;
        if(!startDate || !endDate) {
          return Boom.badRequest('Missing start or end date in query');
        }
        try {
          const query = await client.query(`
            SELECT
              date_string, tag
            FROM
              weekly_tags
            WHERE
              userid = $1 and date_string between $2 and $3
            GROUP BY
              date_string, tag
            ORDER BY
              date_string, tag;
          `, [userid, startDate, endDate]);
          const res = {};
          for (let row of query.rows) {
            if (!_.has(res, row.date_string)) {
              res[row.date_string] = [];
            }
            res[row.date_string].push(row.tag);
          }
          return res;
        } catch (e) {
          console.log(e);
          return Boom.badImplementation('Error getting tags');
        }
      }
    });
  }
}

module.exports = routesTags;
