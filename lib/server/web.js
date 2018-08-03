/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const Hapi = require('hapi');
const Raven = require('raven');
const ScopeSet = require('fxa-shared').oauth.scopes;

const AppError = require('../error');
const config = require('../config').getProperties();
const logger = require('../logging')('server.web');
const request = require('../request');
const summary = require('../logging/summary');

function trimLocale(header) {
  if (! header) {
    return header;
  }
  if (header.length < 256) {
    return header.trim();
  }
  var parts = header.split(',');
  var str = parts[0];
  if (str.length >= 255) {
    return null;
  }
  for (var i = 1; i < parts.length && str.length + parts[i].length < 255; i++) {
    str += ',' + parts[i];
  }
  return str.trim();
}

// This is the webserver. It's what the outside always talks to. It
// handles the whole Profile API.
exports.create = async function create() {
  var useRedis = config.serverCache.useRedis;
  var cache = {
    engine: useRedis ? require('catbox-redis') : require('catbox-memory')
  };
  if (useRedis) {
    cache.name = 'redisCache';
    cache.host = config.serverCache.redis.host;
    cache.port = config.serverCache.redis.port;
    cache.partition = config.serverCache.redis.keyPrefix;
  }
  var isProd = config.env === 'production';
  var server = new Hapi.Server({
    host: config.server.host,
    port: config.server.port,
    cache: cache,
    debug: { request: ['error'] },
    routes: {
      cors: true,
      security: {
        hsts: {
          maxAge: 15552000,
          includeSubdomains: true
        },
        xframe: true,
        xss: true,
        noOpen: false,
        noSniff: true
      }
    },
  });


  if (config.hpkpConfig && config.hpkpConfig.enabled) {
    var hpkpOptions = {
      maxAge: config.hpkpConfig.maxAge,
      sha256s: config.hpkpConfig.sha256s,
      includeSubdomains: config.hpkpConfig.includeSubDomains
    };

    if (config.hpkpConfig.reportUri){
      hpkpOptions.reportUri = config.hpkpConfig.reportUri;
    }

    if (config.hpkpConfig.reportOnly){
      hpkpOptions.reportOnly = config.hpkpConfig.reportOnly;
    }

    try {
      await server.register({
        plugin: require('hapi-hpkp'),
        options: hpkpOptions
      });
    } catch (err){
      throw err;
    }
  }

  // configure Sentry
  const sentryDsn = config.sentryDsn;
  if (sentryDsn) {
    Raven.config(sentryDsn, {});
    server.on('request-error', function (request, err) {
      let exception = '';
      if (err && err.stack) {
        try {
          exception = err.stack.split('\n')[0];
        } catch (e) {
          // ignore bad stack frames
        }
      }

      Raven.captureException(err, {
        extra: {
          exception: exception
        }
      });
    });
  }

  server.auth.scheme('oauth', function() {
    return {
      authenticate: async function(req, h) {
        var auth = req.headers.authorization;
        var url = config.oauth.url + '/verify';
        logger.debug('auth', auth);
        if (! auth || auth.indexOf('Bearer') !== 0) {
          throw AppError.unauthorized('Bearer token not provided');
        }
        var token = auth.split(' ')[1];

        function makeReq() {
          return new Promise((resolve, reject) => {
            request.post({
              url: url,
              json: {
                token: token,
                email: false // disables email fetching of oauth server
              }
            }, function (err, resp, body) {
              if (err || resp.statusCode >= 500) {
                err = err || resp.statusMessage || 'unknown';
                logger.error('oauth.error', err);
                return reject(AppError.oauthError(err));
              }
              if (body.code >= 400) {
                logger.debug('unauthorized', body);
                return reject(AppError.unauthorized(body.message));
              }
              logger.debug('auth.valid', body);
              body.token = token;
              return resolve(body);
            });
          });
        }

        return makeReq().then((body) => {
          return h.authenticated({
            credentials: body
          });
        });
      }
    };
  });

  server.auth.strategy('oauth', 'oauth');

  // server method for caching profile
  try {
    await server.register({
      name: 'profileCache',
      register: require('../profileCache'),
      options: config.serverCache
    });
  } catch (err){
    throw err;
  }

  var routes = require('../routing');
  if (isProd) {
    logger.info('production', 'Disabling response schema validation');
    routes.forEach(function(route) {
      delete route.options.response;
    });
  }

  // Expand the scope list on each route to include all super-scopes,
  // so that Hapi can easily check them via simple string comparison.
  routes.forEach(function(route) {
    var scope = route.options.auth && route.options.auth.scope;
    if (scope) {
      route.options.auth.scope = ScopeSet.fromArray(scope).getImplicantValues();
    }
  });

  routes.forEach(function(route) {
    if (route.options.cache === undefined) {
      route.options.cache = {
        otherwise: 'private, no-cache, no-store, must-revalidate'
      };
    }
  });

  server.route(routes);

  server.ext('onPreAuth', function (request, h) {
    // Construct source-ip-address chain for logging.
    var xff = (request.headers['x-forwarded-for'] || '').split(/\s*,\s*/);
    xff.push(request.info.remoteAddress);
    // Remove empty items from the list, in case of badly-formed header.
    xff = xff.filter(function(x){
      return x;
    });
    // Skip over entries for our own infra, loadbalancers, etc.
    var clientAddressIndex = xff.length - (config.clientAddressDepth || 1);
    if (clientAddressIndex < 0) {
      clientAddressIndex = 0;
    }
    request.app.remoteAddressChain = xff;
    request.app.clientAddress = xff[clientAddressIndex];

    request.app.acceptLanguage = trimLocale(request.headers['accept-language']);

    if (request.headers.authorization) {
      // Log some helpful details for debugging authentication problems.
      logger.debug('server.onPreAuth');
      logger.debug('rid', request.id);
      logger.debug('path', request.path);
      logger.debug('auth', request.headers.authorization);
      logger.debug('type', request.headers['content-type'] || '');
    }
    return h.continue;
  });

  server.ext('onPreResponse', function(request, h) {
    var response = request.response;
    if (response.isBoom) {
      response = AppError.translate(response);
    }
    return summary(request, response);
  });

  return server;
};
