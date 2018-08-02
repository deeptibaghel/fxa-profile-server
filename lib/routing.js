/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const config = require('./config').getProperties();
const version = config.api.version;

function v(url) {
  return '/v' + version + url;
}
module.exports = [
  {
    method: 'GET',
    path: '/',
    options: require('./routes/root')
  },
  {
    method: 'GET',
    path: '/__version__',
    options: require('./routes/root')
  },
  {
    method: 'GET',
    path: '/__heartbeat__',
    options: require('./routes/heartbeat')
  },
  {
    method: 'GET',
    path: '/__lbheartbeat__',
    options: require('./routes/lbheartbeat')
  },
  {
    method: 'GET',
    path: v('/_core_profile'),
    options: require('./routes/_core_profile')
  },
  {
    method: 'GET',
    path: v('/profile'),
    options: require('./routes/profile')
  },
  {
    method: 'GET',
    path: v('/email'),
    options: require('./routes/email')
  },
  {
    method: 'GET',
    path: v('/uid'),
    options: require('./routes/uid')
  },
  {
    method: 'GET',
    path: v('/avatar'),
    options: require('./routes/avatar/get')
  },
  {
    method: 'POST',
    path: v('/avatar/upload'),
    options: require('./routes/avatar/upload')
  },
  {
    method: 'DELETE',
    path: v('/avatar/{id?}'),
    options: require('./routes/avatar/delete')
  },
  {
    method: 'GET',
    path: v('/display_name'),
    options: require('./routes/display_name/get')
  },
  {
    method: 'POST',
    path: v('/display_name'),
    options: require('./routes/display_name/post')
  }
];
