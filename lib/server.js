'use strict';

const Hapi = require('hapi'),
  Blipp = require('blipp');

// Create a server with a host and port
const server = new Hapi.Server({  
  host: 'localhost',
  port: 3000,
  routes: { cors: {"headers": ["Accept", "Authorization", "Content-Type", "If-None-Match", "Accept-language"]}}
});

const init = async function() {
  await server.register([  
    { 
      plugin: Blipp
    },
    {
      plugin: require('./db'),
    },
    {
      plugin: require('./auth')
    },
    // { 
    //   plugin: require('./routes/entries')
    // }
  ]);
  await server.start();
  console.log(`Server running at: ${server.info.uri}`);
};

process.on('unhandledRejection', (err) => {
  console.log(err);
  process.exit(1);
});

init();

module.exports = server;