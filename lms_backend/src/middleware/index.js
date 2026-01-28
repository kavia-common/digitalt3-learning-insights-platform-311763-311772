const auth = require('./auth');
const rbac = require('./rbac');

// This file exports middleware as the application grows
module.exports = {
  auth,
  rbac,
};
