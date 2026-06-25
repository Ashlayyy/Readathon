const path = require('path')

const root = __dirname
const mode = process.env.APP_MODE === 'development' ? 'development' : 'production'
const isDev = mode === 'development'

const apiArgs = isDev ? 'run dev:server' : 'run start:server'
const webArgs = isDev ? 'run dev:frontend' : 'run preview:frontend'

/** @type {import('pm2').StartOptions[]} */
const apps = [
  {
    name: 'realmathon-api',
    cwd: root,
    script: 'npm',
    args: apiArgs,
    interpreter: 'none',
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
    time: true,
    merge_logs: true,
    out_file: path.join(root, 'logs', 'api-out.log'),
    error_file: path.join(root, 'logs', 'api-error.log'),
    env: {
      NODE_ENV: isDev ? 'development' : 'production',
      APP_MODE: mode,
    },
  },
  {
    name: 'realmathon-web',
    cwd: root,
    script: 'npm',
    args: webArgs,
    interpreter: 'none',
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
    time: true,
    merge_logs: true,
    out_file: path.join(root, 'logs', 'web-out.log'),
    error_file: path.join(root, 'logs', 'web-error.log'),
    env: {
      NODE_ENV: isDev ? 'development' : 'production',
      APP_MODE: mode,
    },
  },
]

module.exports = { apps }
