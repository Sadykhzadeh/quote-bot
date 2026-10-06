const path = require('path')

// './.env' is resolved against the process working directory, not this file,
// so starting the bot from anywhere else - which is what pm2 does with a cwd
// setting, and what a systemd unit does by default - silently loaded no
// configuration at all and left BOT_TOKEN undefined.
require('dotenv').config({ path: path.join(__dirname, '.env') })
require('./bot')
