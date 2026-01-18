import React, { createContext, useContext, useEffect, useState } from "react";

interface Config {
  site_info?: {
    site_name?: string;
    region?: string;
    timezone?: string;
    nominal_system_energy_ac?: number;
    backup_reserve_percent?: number;
    customer_preferred_export_rule?: string;
    battery_commission_date?: string;
    tariff_content?: {
      code?: string;
      name?: string;
      utility?: string;
      energy_charges?: any;
      seasons?: any;
    };
  };
  vin?: string;
  meters?: {
    location: string;
    type: string;
    connection?: {
      ip_address?: string;
      device_serial?: string;
    };
  }[];
  battery_blocks?: {
    vin: string;
    type: string;
    min_soe?: number;
    max_soe?: number;
  }[];
  installer?: {
    company?: string;
    phone?: string;
    solar_installation_type?: string;
  };
  customer?: {
    registered?: boolean;
  };
}

interface ConfigContextType {
  config: Config | null;
  loading: boolean;
  error: string | null;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/config")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch config");
        return res.json();
      })
      .then((data) => {
        setConfig(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching config:", err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <ConfigContext.Provider value={{ config, loading, error }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error("useConfig must be used within a ConfigProvider");
  }
  return context;
}
