const path = require('path')

const root = __dirname
const mode = process.env.APP_MODE === 'development' ? 'development' : 'production'
const isDev = mode === 'development'

/** @type {import('pm2').StartOptions[]} */
const apps = isDev
  ? [
      {
        name: 'readathon-api',
        cwd: root,
        script: 'npm',
        args: 'run dev:server',
        interpreter: 'none',
        autorestart: true,
        max_restarts: 10,
        restart_delay: 3000,
        time: true,
        merge_logs: true,
        out_file: path.join(root, 'logs', 'api-out.log'),
        error_file: path.join(root, 'logs', 'api-error.log'),
        env: {
          NODE_ENV: 'development',
          APP_MODE: 'development',
        },
      },
      {
        name: 'readathon-web',
        cwd: root,
        script: 'npm',
        args: 'run dev:frontend',
        interpreter: 'none',
        autorestart: true,
        max_restarts: 10,
        restart_delay: 3000,
        time: true,
        merge_logs: true,
        out_file: path.join(root, 'logs', 'web-out.log'),
        error_file: path.join(root, 'logs', 'web-error.log'),
        env: {
          NODE_ENV: 'development',
          APP_MODE: 'development',
        },
      },
      {
        name: 'readathon-product',
        cwd: root,
        script: 'npm',
        args: 'run dev:product',
        interpreter: 'none',
        autorestart: true,
        max_restarts: 10,
        restart_delay: 3000,
        time: true,
        merge_logs: true,
        out_file: path.join(root, 'logs', 'product-out.log'),
        error_file: path.join(root, 'logs', 'product-error.log'),
        env: {
          NODE_ENV: 'development',
          APP_MODE: 'development',
        },
      },
    ]
  : [
      {
        name: 'readathon',
        cwd: root,
        script: 'npm',
        args: 'run start:server',
        interpreter: 'none',
        autorestart: true,
        max_restarts: 10,
        restart_delay: 3000,
        time: true,
        merge_logs: true,
        out_file: path.join(root, 'logs', 'app-out.log'),
        error_file: path.join(root, 'logs', 'app-error.log'),
        env: {
          NODE_ENV: 'production',
          APP_MODE: 'production',
          PORT: 3001,
        },
      },
    ]

module.exports = { apps }
