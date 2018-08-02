/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const Hapi = require('hapi');
const Boom = require('boom');
const path = require('path');
const Inert = require('inert');

const config = require('../config').getProperties();
const logger = require('../logging')('server.static');

const DEFAULT_AVATAR_DIR = path.resolve(__dirname, '..', 'assets');
const DEFAULT_AVATAR_ID = config.img.defaultAvatarId;
const DEFAULT_AVATAR = path.resolve(DEFAULT_AVATAR_DIR, 'default-profile.png');
const DEFAULT_AVATAR_LARGE = path.resolve(DEFAULT_AVATAR_DIR, 'default-profile_large.png');
const DEFAULT_AVATAR_SMALL = path.resolve(DEFAULT_AVATAR_DIR, 'default-profile_small.png');

exports.create = async function() {
  var server = new Hapi.Server({
    host: config.server.host,
    port: config.server.port + 1,
    debug: false
  });

  await server.register(Inert);

  server.route({
    method: 'GET',
    path: '/a/' +  DEFAULT_AVATAR_ID + '{type?}',
    handler: function (request, h) {
      switch (request.params.type) {
      case '':
        h.file(DEFAULT_AVATAR);
        break;
      case '_small':
        h.file(DEFAULT_AVATAR_SMALL);
        break;
      case '_large':
        h.file(DEFAULT_AVATAR_LARGE);
        break;
      default:
        return Boom.notFound();
      }
    }
  });

  server.route({
    method: 'GET',
    path: '/a/{id}',
    handler: {
      'directory': {
        'path': config.img.uploads.dest.public
      }
    }
  });

  server.events.on('log', function onLog(evt) {
    logger.verbose('hapi.server', evt);
  });

  server.events.on('request', function onRequest(req, evt) {
    logger.verbose('hapi.request', evt);
  });

  return server;
};
