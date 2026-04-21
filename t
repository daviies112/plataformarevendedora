[0;1;32m●[0m pm2-root.service - PM2 process manager
     Loaded: loaded (]8;;file://srv1480403/etc/systemd/system/pm2-root.service/etc/systemd/system/pm2-root.service]8;;; [0;1;32menabled[0m; preset: [0;1;32menabled[0m)
     Active: [0;1;32mactive (running)[0m since Tue 2026-03-17 15:18:28 UTC; 16ms ago
       Docs: ]8;;https://pm2.keymetrics.io/https://pm2.keymetrics.io/]8;;
    Process: 2465897 ExecStart=/usr/lib/node_modules/pm2/bin/pm2 resurrect (code=exited, status=0/SUCCESS)
   Main PID: 2463938 (PM2 v6.0.14: Go)
      Tasks: 0 (limit: 19144)
     Memory: 4.0K (peak: 17.5M)
        CPU: 226ms
     CGroup: /system.slice/pm2-root.service
             ‣ 2463938 "PM2 v6.0.14: God Daemon (/root/.pm2)"

Mar 17 15:18:27 srv1480403 systemd[1]: Starting pm2-root.service - PM2 process manager...
Mar 17 15:18:27 srv1480403 pm2[2465897]: [PM2] Resurrecting
Mar 17 15:18:27 srv1480403 pm2[2465897]: [PM2] Restoring processes located in /root/.pm2/dump.pm2
Mar 17 15:18:28 srv1480403 pm2[2465897]: ┌────┬──────────────────────────┬─────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┬──────────┬──────────┬──────────┬──────────┐
Mar 17 15:18:28 srv1480403 pm2[2465897]: │ id │ name                     │ namespace   │ version │ mode    │ pid      │ uptime │ ↺    │ status    │ cpu      │ mem      │ user     │ watching │
Mar 17 15:18:28 srv1480403 pm2[2465897]: ├────┼──────────────────────────┼─────────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┼──────────┼──────────┼──────────┼──────────┤
Mar 17 15:18:28 srv1480403 pm2[2465897]: │ 0  │ plataformacompleta       │ default     │ 0.0.0   │ fork    │ 2465587  │ 8s     │ 0    │ online    │ 0%       │ 268.9mb  │ root     │ disabled │
Mar 17 15:18:28 srv1480403 pm2[2465897]: │ 1  │ plataformarevendedora    │ default     │ 0.0.0   │ fork    │ 2465649  │ 5s     │ 0    │ online    │ 0%       │ 344.6mb  │ root     │ disabled │
Mar 17 15:18:28 srv1480403 pm2[2465897]: └────┴──────────────────────────┴─────────────┴─────────┴─────────┴──────────┴────────┴──────┴───────────┴──────────┴──────────┴──────────┴──────────┘
Mar 17 15:18:28 srv1480403 systemd[1]: Started pm2-root.service - PM2 process manager.
