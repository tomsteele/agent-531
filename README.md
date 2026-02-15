# agent-531

A 5/3/1 agent

## Deploy

Systemd
```
[Unit]
Description=5/3/1 Training Agent
After=network.target

[Service]
Type=simple
User=tom
WorkingDirectory=/home/tom/source/agent-531
ExecStart=/home/tom/.bun/bin/bun run src/index.ts
Restart=on-failure
RestartSec=10
EnvironmentFile=/home/tom/source/agent-531/.env

[Install]
WantedBy=multi-user.target
```
