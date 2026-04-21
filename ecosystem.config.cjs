module.exports = {
  apps: [
    {
      name: 'plataformarevendedora',
      script: '/var/www/plataformarevendedora/dist/index.mjs',
      cwd: '/var/www/plataformarevendedora',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 5002
      },
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: '/var/www/plataformarevendedora/logs/err.log',
      out_file: '/var/www/plataformarevendedora/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
