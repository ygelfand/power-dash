# Power Dash

> 🚧 **Work in Progress** 🚧
>
> This project is currently in **Early Alpha**. Features may change, and bugs are to be expected.

**Power Dash** is a modern, self-hosted dashboard and automation platform for the Tesla Powerwall. It acts as a high-performance bridge to your local gateway, collecting high-frequency data and presenting it in a beautiful, responsive interface.

![Power Dash Dashboard](docs/images/power-dash.png)

## ✨ Features

- **⚡ Real-Time Monitoring**: Live visualization of power flow (Grid, Home, Solar, Battery) with sub-second updates.
- **🔋 Comprehensive Data**: Tracks Battery SoE, String Voltages, Inverter Health, and Grid Frequency/Voltage.
- **💾 Embedded Storage**: Built-in, high-performance time-series database (Prometheus TSDB). No external database required.
- **🚀 Modern UI**: Fast, responsive frontend built with **React**, **Mantine**, and **uPlot** for smooth zooming and panning.
- **🔌 API Proxy**: Securely proxies requests to the Powerwall API, handling authentication and session management.
- **📥 Historical Import**: Migration tools to import your existing data from InfluxDB (from _Powerwall-Dashboard_).

## 🛠️ Tech Stack

- **Backend**: Go 1.25+ (Gin, Cobra, Viper, Zap)
- **Frontend**: React 19, Mantine UI, Vite
- **Database**: Embedded Prometheus TSDB

## 🚀 Getting Started

### Prerequisites

- A Tesla Powerwall Gateway _on your local network routable via the gateways wifi interface_.
- Your Powerwall installer password (wifi password).

### Running Locally (Development)

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/ygelfand/power-dash.git
    cd power-dash
    ```

2.  **Build and Run:**
    You can start the backend and frontend in development mode:

    ```bash
    make run-dev
    ```

    - Backend: `http://localhost:8080`
    - Frontend: `http://localhost:8000`

3.  **Build Binary:**
    To produce a standalone binary with the UI embedded:
    ```bash
    make all
    ./bin/power-dash run --help
    ```

### Configuration

Power Dash can be configured via flags, environment variables, or a config file (`power-dash.yaml`).

**Example `power-dash.yaml`:**

```yaml
endpoint: "https://192.168.91.1/"
password: "YOUR_INSTALLER_PASSWORD"
collection-interval: 1
log-level: "info" # debug, info, warn, error
storage:
  path: "./data"
  retention: "720h" # 30 days
```

### Importing Data

Migrate from InfluxDB using the **Settings** page in the web UI or via the built-in CLI command:

```bash
# Import the last year of data via CLI
./power-dash import --influx-host "http://192.168.1.50:8086" --since "1y"
```

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.
