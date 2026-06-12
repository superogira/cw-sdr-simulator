module.exports = {
    apps: [{
        name: 'cw-sdr',
        script: 'server.js',
        cwd: __dirname,
        instances: 1,
        exec_mode: 'fork',
        max_memory_restart: '500M',
        autorestart: true,
        watch: false,
        env_production: {
            NODE_ENV: 'production',
            PORT: 3000
        },
        error_file: '../logs/err.log',
        out_file: '../logs/out.log',
        merge_logs: true,
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }]
};
