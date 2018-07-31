/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const config = require('../lib/config').getProperties();
const logger = require('../lib/logging')('bin._static');

async function create() {
  const server = await require('../lib/server/_static').create();
  server.start().then(() => {
    logger.info('listening', server.info.uri);
  });
}
create();

if (config.env !== 'development') {
  logger.warn('sanity-check', 'static bin should only be used for local dev!');
}

