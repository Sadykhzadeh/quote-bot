module.exports = {
  apps: [{
    name: 'QuoteBot',
    script: './index.js',
    max_memory_restart: '1000M',
    // instances: 1,
    // exec_mode: 'cluster',
    // watch was on for both environments, so in production pm2 restarted the
    // bot on any write under the project - including the .env file and
    // anything the tdlib helper puts on disk. Pass --watch to pm2 when that
    // is what you want in development; it is not an env var.
    watch: false,
    ignore_watch: ['node_modules', 'assets', 'helpers/tdlib/data', '.env', '*.log'],
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production'
    }
  }]
}
