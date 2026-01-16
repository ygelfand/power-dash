package powerwall

type DeviceControllerResponse struct {
	Components struct {
		Msa []struct {
			ActiveAlerts []struct {
				Name string `json:"name,omitempty"`
			} `json:"activeAlerts,omitempty"`
			PartNumber   string `json:"partNumber,omitempty"`
			SerialNumber string `json:"serialNumber,omitempty"`
			Signals      []struct {
				BoolValue any      `json:"boolValue"`
				Name      string   `json:"name"`
				TextValue *string  `json:"textValue"`
				Timestamp string   `json:"timestamp"`
				Value     *float32 `json:"value"`
			} `json:"signals"`
		} `json:"msa,omitempty"`
	} `json:"components,omitempty"`
	Control struct {
		Alerts struct {
			Active []string `json:"active,omitempty"`
		} `json:"alerts,omitempty"`
		BatteryBlocks []struct {
			Din            string `json:"din,omitempty"`
			DisableReasons any    `json:"disableReasons,omitempty"`
		} `json:"batteryBlocks,omitempty"`
		Islanding struct {
			ContactorClosed    bool   `json:"contactorClosed,omitempty"`
			CustomerIslandMode string `json:"customerIslandMode,omitempty"`
			GridOK             bool   `json:"gridOK,omitempty"`
			MicroGridOK        bool   `json:"microGridOK,omitempty"`
		} `json:"islanding,omitempty"`
		MeterAggregates []struct {
			Location   string  `json:"location,omitempty"`
			RealPowerW float64 `json:"realPowerW,omitempty"`
		} `json:"meterAggregates,omitempty"`
		PvInverters  []any `json:"pvInverters,omitempty"`
		SiteShutdown struct {
			IsShutDown bool  `json:"isShutDown,omitempty"`
			Reasons    []any `json:"reasons,omitempty"`
		} `json:"siteShutdown,omitempty"`
		SystemStatus struct {
			NominalEnergyRemainingWh int `json:"nominalEnergyRemainingWh,omitempty"`
			NominalFullPackEnergyWh  int `json:"nominalFullPackEnergyWh,omitempty"`
		} `json:"systemStatus,omitempty"`
	} `json:"control,omitempty"`
	EsCan struct {
		Bus struct {
			Islander struct {
				ISLANDAcMeasurements struct {
					ISLANDFreqL1Load float64 `json:"ISLAND_FreqL1_Load,omitempty"`
					ISLANDFreqL1Main float64 `json:"ISLAND_FreqL1_Main,omitempty"`
					ISLANDFreqL2Load float64 `json:"ISLAND_FreqL2_Load,omitempty"`
					ISLANDFreqL2Main float64 `json:"ISLAND_FreqL2_Main,omitempty"`
					ISLANDFreqL3Load float64 `json:"ISLAND_FreqL3_Load,omitempty"`
					ISLANDFreqL3Main float64 `json:"ISLAND_FreqL3_Main,omitempty"`
					ISLANDGridState  string  `json:"ISLAND_GridState,omitempty"`
					ISLANDVL1NLoad   float64 `json:"ISLAND_VL1N_Load,omitempty"`
					ISLANDVL1NMain   float64 `json:"ISLAND_VL1N_Main,omitempty"`
					ISLANDVL2NLoad   float64 `json:"ISLAND_VL2N_Load,omitempty"`
					ISLANDVL2NMain   float64 `json:"ISLAND_VL2N_Main,omitempty"`
					ISLANDVL3NLoad   float64 `json:"ISLAND_VL3N_Load,omitempty"`
					ISLANDVL3NMain   float64 `json:"ISLAND_VL3N_Main,omitempty"`
					IsComplete       bool    `json:"isComplete,omitempty"`
					IsMIA            bool    `json:"isMIA,omitempty"`
					LastRxTime       string  `json:"lastRxTime,omitempty"`
				} `json:"ISLAND_AcMeasurements,omitempty"`
				ISLANDGridConnection struct {
					ISLANDGridConnected string `json:"ISLAND_GridConnected,omitempty"`
					IsComplete          bool   `json:"isComplete,omitempty"`
				} `json:"ISLAND_GridConnection,omitempty"`
			} `json:"ISLANDER,omitempty"`
			Msa struct {
				METERZAcMeasurements struct {
					MeterZCtaI                 float64 `json:"METER_Z_CTA_I,omitempty"`
					METERZCTAInstReactivePower int     `json:"METER_Z_CTA_InstReactivePower,omitempty"`
					METERZCTAInstRealPower     int     `json:"METER_Z_CTA_InstRealPower,omitempty"`
					MeterZCtbI                 float64 `json:"METER_Z_CTB_I,omitempty"`
					METERZCTBInstReactivePower int     `json:"METER_Z_CTB_InstReactivePower,omitempty"`
					METERZCTBInstRealPower     int     `json:"METER_Z_CTB_InstRealPower,omitempty"`
					MeterZVl1G                 float64 `json:"METER_Z_VL1G,omitempty"`
					MeterZVl2G                 float64 `json:"METER_Z_VL2G,omitempty"`
					IsMIA                      bool    `json:"isMIA,omitempty"`
					LastRxTime                 string  `json:"lastRxTime,omitempty"`
				} `json:"METER_Z_AcMeasurements,omitempty"`
				MSAInfoMsg struct {
					MSAAppGitHash []int `json:"MSA_appGitHash,omitempty"`
					IsMIA         bool  `json:"isMIA,omitempty"`
				} `json:"MSA_InfoMsg,omitempty"`
				PackagePartNumber   string `json:"packagePartNumber,omitempty"`
				PackageSerialNumber string `json:"packageSerialNumber,omitempty"`
			} `json:"MSA,omitempty"`
			Pinv []struct {
				PINVAcMeasurements struct {
					PINVVSplit1 float64 `json:"PINV_VSplit1,omitempty"`
					PINVVSplit2 float64 `json:"PINV_VSplit2,omitempty"`
					PINVVSplit3 float64 `json:"PINV_VSplit3,omitempty"`
					IsMIA       bool    `json:"isMIA,omitempty"`
				} `json:"PINV_AcMeasurements,omitempty"`
				PINVPowerCapability struct {
					PINVPnom   int  `json:"PINV_Pnom,omitempty"`
					IsComplete bool `json:"isComplete,omitempty"`
					IsMIA      bool `json:"isMIA,omitempty"`
				} `json:"PINV_PowerCapability,omitempty"`
				PINVStatus struct {
					PINVFout  float64 `json:"PINV_Fout,omitempty"`
					PINVPout  float64 `json:"PINV_Pout,omitempty"`
					PINVState string  `json:"PINV_State,omitempty"`
					PINVVout  float64 `json:"PINV_Vout,omitempty"`
					IsMIA     bool    `json:"isMIA,omitempty"`
				} `json:"PINV_Status,omitempty"`
				Alerts struct {
					Active []string `json:"active,omitempty"`
					IsMIA  bool     `json:"isMIA,omitempty"`
				} `json:"alerts,omitempty"`
			} `json:"PINV,omitempty"`
			Pod []struct {
				PODEnergyStatus struct {
					PODNomEnergyRemaining int  `json:"POD_nom_energy_remaining,omitempty"`
					PODNomFullPackEnergy  int  `json:"POD_nom_full_pack_energy,omitempty"`
					IsMIA                 bool `json:"isMIA,omitempty"`
				} `json:"POD_EnergyStatus,omitempty"`
				PODInfoMsg struct {
					PODAppGitHash []int `json:"POD_appGitHash,omitempty"`
				} `json:"POD_InfoMsg,omitempty"`
			} `json:"POD,omitempty"`
			Pvac []struct {
				PVACInfoMsg struct {
					PVACAppGitHash []int `json:"PVAC_appGitHash,omitempty"`
				} `json:"PVAC_InfoMsg,omitempty"`
				PVACLogging struct {
					PVAC_Fan_Speed_Actual_RPM int     `json:"PVAC_Fan_Speed_Actual_RPM"`
					PVAC_Fan_Speed_Target_RPM int     `json:"PVAC_Fan_Speed_Target_RPM"`
					PVACPVCurrentA            float64 `json:"PVAC_PVCurrent_A,omitempty"`
					PVACPVCurrentB            float64 `json:"PVAC_PVCurrent_B,omitempty"`
					PVACPVCurrentC            float64 `json:"PVAC_PVCurrent_C,omitempty"`
					PVACPVCurrentD            float64 `json:"PVAC_PVCurrent_D,omitempty"`
					PVACPVMeasuredVoltageA    float64 `json:"PVAC_PVMeasuredVoltage_A,omitempty"`
					PVACPVMeasuredVoltageB    float64 `json:"PVAC_PVMeasuredVoltage_B,omitempty"`
					PVACPVMeasuredVoltageC    float64 `json:"PVAC_PVMeasuredVoltage_C,omitempty"`
					PVACPVMeasuredVoltageD    float64 `json:"PVAC_PVMeasuredVoltage_D,omitempty"`
					PVACVL1Ground             float64 `json:"PVAC_VL1Ground,omitempty"`
					PVACVL2Ground             float64 `json:"PVAC_VL2Ground,omitempty"`
					IsMIA                     bool    `json:"isMIA,omitempty"`
				} `json:"PVAC_Logging,omitempty"`
				PVACStatus struct {
					PVACFout  float64 `json:"PVAC_Fout,omitempty"`
					PVACPout  float64 `json:"PVAC_Pout,omitempty"`
					PVACState string  `json:"PVAC_State,omitempty"`
					PVACVout  float64 `json:"PVAC_Vout,omitempty"`
					IsMIA     bool    `json:"isMIA,omitempty"`
				} `json:"PVAC_Status,omitempty"`
				Alerts struct {
					Active []string `json:"active,omitempty"`
					IsMIA  bool     `json:"isMIA,omitempty"`
				} `json:"alerts,omitempty"`
				PackagePartNumber   string `json:"packagePartNumber,omitempty"`
				PackageSerialNumber string `json:"packageSerialNumber,omitempty"`
			} `json:"PVAC,omitempty"`
			Pvs []struct {
				PVSStatus struct {
					PVSSelfTestState    string  `json:"PVS_SelfTestState,omitempty"`
					PVSState            string  `json:"PVS_State,omitempty"`
					PVSStringAConnected bool    `json:"PVS_StringA_Connected,omitempty"`
					PVSStringBConnected bool    `json:"PVS_StringB_Connected,omitempty"`
					PVSStringCConnected bool    `json:"PVS_StringC_Connected,omitempty"`
					PVSStringDConnected bool    `json:"PVS_StringD_Connected,omitempty"`
					PVSVLL              float64 `json:"PVS_vLL,omitempty"`
					IsMIA               bool    `json:"isMIA,omitempty"`
				} `json:"PVS_Status,omitempty"`
				Alerts struct {
					Active []string `json:"active,omitempty"`
					IsMIA  bool     `json:"isMIA,omitempty"`
				} `json:"alerts,omitempty"`
			} `json:"PVS,omitempty"`
			Thc []struct {
				THCInfoMsg struct {
					THCAppGitHash []int `json:"THC_appGitHash,omitempty"`
					IsMIA         bool  `json:"isMIA,omitempty"`
				} `json:"THC_InfoMsg,omitempty"`
				PackagePartNumber   string `json:"packagePartNumber,omitempty"`
				PackageSerialNumber string `json:"packageSerialNumber,omitempty"`
			} `json:"THC,omitempty"`
		} `json:"bus,omitempty"`
	} `json:"esCan,omitempty"`
	Neurio struct {
		Readings []struct {
			Serial          string `json:"serial,omitempty"`
			FirmwareVersion string `json:"firmwareVersion,omitempty"`
			DataRead        []struct {
				CurrentA         float64 `json:"currentA,omitempty"`
				ReactivePowerVAR float64 `json:"reactivePowerVAR,omitempty"`
				RealPowerW       float64 `json:"realPowerW,omitempty"`
				VoltageV         float64 `json:"voltageV,omitempty"`
			} `json:"dataRead,omitempty"`
		} `json:"readings,omitempty"`
	} `json:"neurio,omitempty"`
	System struct {
		Time string `json:"time,omitempty"`
	} `json:"system,omitempty"`
}
