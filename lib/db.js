'use strict';

const db = {
  name: 'pg',
  version: '1.0.0',
  register: async function (server, options) { 
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: true
    });
    const client = await pool.connect();
    server.expose('client', client);
  }
};

module.exports = db;