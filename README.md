# agent-531

A 5/3/1 training agent on Discord.

## About

Personal Discord bot and Anthropic SDK agent that builds lifting programs from [Jim Wendler's 5/3/1 templates](https://www.jimwendler.com/products/5-3-1-forever-book).

## Interactions

### Program setup

The agent walks you through setting up a new program — tested 1RMs, template selection, and training schedule.

![Program setup — available templates and 1RM prompt](interactions/1.png)

![Training max calculation and template suggestions](interactions/2.png)

![Final program confirmation with schedule](interactions/3.png)

### Workout delivery

Ask for your workout and the agent pulls the prescribed sets from your current template, week, and training max.

![Workout with main and supplemental sets](interactions/4.png)

## Deploy

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment

Create a `.env` file in the project root with your Discord bot token, Anthropic API key, and allowed user ID.

### 3. Set up systemd user service

Create the service file:

```bash
mkdir -p ~/.config/systemd/user/
```

The service file `531-agent.service`:

```ini
[Unit]
Description=5/3/1 Training Agent
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/tom/source/agent-531
ExecStart=/home/tom/.bun/bin/bun run src/index.ts
Restart=on-failure
RestartSec=10
EnvironmentFile=/home/tom/source/agent-531/.env

[Install]
WantedBy=default.target
```

### 4. Enable and start

```bash
systemctl --user daemon-reload
systemctl --user enable 531-agent.service
systemctl --user start 531-agent.service
```

Allow the service to run after logout:

```bash
loginctl enable-linger $USER
```

### 5. Useful commands

```bash
systemctl --user status 531-agent.service   # check status
journalctl --user -u 531-agent.service -f   # tail logs
systemctl --user restart 531-agent.service   # restart after code changes
```
