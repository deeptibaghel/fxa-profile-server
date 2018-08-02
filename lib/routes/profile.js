/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const Joi = require('joi');
const checksum = require('checksum');

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
  handler: async function profile(req) {
    const server = req.server;
    const creds = req.auth.credentials;

    return server.methods.profileCache.get(req)
      .then((result, cached, report) => {
        if (creds.scope.indexOf('openid') !== -1) {
          result.sub = creds.user;
        }

        let rep = result;
        const etag = computeEtag(result);
        if (etag) {
          rep = rep.etag(etag);
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
      });
  }
};


