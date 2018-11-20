/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const Joi = require('joi');
const checksum = require('checksum');
const P = require('../promise');

const logger = require('../logging')('routes.profile');

function computeEtag(profile) {
  if (profile) {
    return checksum(JSON.stringify(profile));
  }
  return false;
}

module.exports = {
  auth: {
    strategy: 'oauth'
  },
  response: {
    schema: {
      email: Joi.string().allow(null),
      uid: Joi.string().allow(null),
      avatar: Joi.string().allow(null),
      avatarDefault: Joi.boolean().allow(null),
      displayName: Joi.string().allow(null),
      locale: Joi.string().allow(null),
      amrValues: Joi.array().items(Joi.string().required()).allow(null),
      twoFactorAuthentication: Joi.boolean().allow(null),

      //openid-connect
      sub: Joi.string().allow(null)
    }
  },
  handler: async function profile(req, h) {
    const server = req.server;
    const creds = req.auth.credentials;

    function createResponse (result, cached, report) {
      // `profileChangedAt` is an internal implementation detail that we don't
      // return to reliers. As of now, we don't expect them to have any
      // use for this.
      result = result.result;
      delete result.profileChangedAt;

      if (creds.scope.indexOf('openid') !== -1) {
        result.sub = creds.user;
      }

      let rep = h.response(result);
      const etag = computeEtag(result);
      if (etag) {
        rep = h.response(result).etag(etag);
      }
      const lastModified = cached ? new Date(cached.stored) : new Date();
      if (cached) {
        logger.info('batch.cached', {
          storedAt: cached.stored,
          error: report && report.error,
          ttl: cached.ttl,
        });
      } else {
        logger.info('batch.db');
      }

      return rep.header('last-modified', lastModified.toUTCString());
    }

    return server.methods.profileCache.get(req)
      .then(async (result, cached, report) => {
        // Check to see if the oauth-server is reporting a newer `profileChangedAt`
        // timestamp from validating the token, if so, lets invalidate the cache
        // and set new value.
        if (result.profileChangedAt < creds.profileChangedAt) {
          await server.methods.profileCache.drop(creds.user);
          logger.info('profileChangedAt:cacheCleared', {uid: creds.user});
          return server.methods.profileCache.get(req)
            .then(() => createResponse);
        }

        return createResponse(result, cached, report);
      });
  }
};


