package powerwall

import (
	"encoding/json"
	"fmt"
)

func (p *PowerwallGateway) FetchController() (*DeviceControllerResponse, error) {
	res := p.RunQuery("DeviceControllerQuery", nil)
	if res == nil {
		return nil, fmt.Errorf("failed to run query")
	}
	var controller DeviceControllerResponse
	err := json.Unmarshal([]byte(*res), &controller)
	if err != nil {
		return nil, err
	}
	return &controller, nil
}

func (p *PowerwallGateway) FetchConfig() (*ConfigResponse, error) {
	res := p.GetConfig()
	if res == nil {
		return nil, fmt.Errorf("failed to run GetConfig query")
	}
	var config ConfigResponse
	err := json.Unmarshal([]byte(*res), &config)
	if err != nil {
		return nil, err
	}
	return &config, nil
}
