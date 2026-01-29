require('dotenv').config();

const { createDataSourceFromEnv } = require('./config/db');

/**
 * TypeORM CLI expects an exported DataSource instance.
 * This file is used by `typeorm` CLI commands in package.json.
 */
module.exports = createDataSourceFromEnv();

